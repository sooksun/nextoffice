import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../intake/services/file-storage.service';
import { EmbeddingService } from '../rag/services/embedding.service';
import { VectorStoreService, COLLECTION_KNOWLEDGE } from '../rag/services/vector-store.service';
import { ChunkingService } from '../rag/services/chunking.service';
import { GeminiApiService } from '../gemini/gemini-api.service';
import { QUEUE_AI_PROCESSING } from '../queue/queue.constants';

@Processor(QUEUE_AI_PROCESSING)
export class KnowledgeImportProcessor {
  private readonly logger = new Logger(KnowledgeImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly embedding: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    private readonly chunking: ChunkingService,
    private readonly gemini: GeminiApiService,
  ) {}

  @Process('knowledge.import.embed')
  async handleEmbed(job: Job<{ itemId: string }>) {
    const itemId = BigInt(job.data.itemId);
    this.logger.log(`Processing knowledge.import.embed for item #${itemId}`);

    const item = await this.prisma.userKnowledgeItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      this.logger.warn(`UserKnowledgeItem #${itemId} not found — skipping`);
      return;
    }

    // Mark as processing
    await this.prisma.userKnowledgeItem.update({
      where: { id: itemId },
      data: { status: 'PROCESSING' },
    });

    try {
      let text = item.extractedText ?? '';

      if (!text && item.storagePath) {
        // Download file from MinIO
        const buffer = await this.storage.getBuffer(item.storagePath);
        const mimeType = item.mimeType ?? 'application/octet-stream';

        // Use Gemini Vision to extract text from PDF or image
        const base64 = buffer.toString('base64');
        const prompt = item.sourceType === 'pdf'
          ? 'สกัดข้อความทั้งหมดจากเอกสาร PDF นี้ให้ครบถ้วน รักษาโครงสร้างและหัวข้อให้ชัดเจน'
          : 'อธิบายและสกัดข้อความทั้งหมดในภาพนี้ ให้ครอบคลุมทุกข้อมูลที่มองเห็น';

        text = await this.gemini.generateFromParts({
          system: 'คุณคือผู้ช่วย OCR/extraction ที่แม่นยำ ให้ข้อความที่สกัดได้เท่านั้น ไม่ต้องอธิบายเพิ่มเติม',
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: prompt },
          ],
          maxOutputTokens: 8192,
        });

        this.logger.log(`Extracted ${text.length} chars from ${item.sourceType} for item #${itemId}`);
      }

      if (!text || text.trim().length < 10) {
        await this.prisma.userKnowledgeItem.update({
          where: { id: itemId },
          data: { status: 'ERROR' },
        });
        this.logger.warn(`Item #${itemId} — extracted text too short, marking ERROR`);
        return;
      }

      // Save extracted text
      await this.prisma.userKnowledgeItem.update({
        where: { id: itemId },
        data: { extractedText: text },
      });

      // Chunk the text
      const chunks = this.chunking.splitText(text);
      this.logger.log(`Split into ${chunks.length} chunks for item #${itemId}`);

      // Embed each chunk and upsert to Qdrant
      let embedded = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          const vector = await this.embedding.embed(chunk);
          if (vector.length === 0) continue;

          const pointId = randomUUID();
          await this.vectorStore.upsert(COLLECTION_KNOWLEDGE, pointId, vector, {
            sourceType: 'user_knowledge',
            itemId: item.id.toString(),
            organizationId: item.organizationId.toString(),
            title: item.title,
            category: item.category ?? '',
            chunkIndex: i,
            text: chunk.substring(0, 500),
          });
          embedded++;
        } catch (err) {
          this.logger.warn(`Chunk ${i} embed failed for item #${itemId}: ${err.message}`);
        }
      }

      // Update status
      await this.prisma.userKnowledgeItem.update({
        where: { id: itemId },
        data: {
          status: 'DONE',
          chunkCount: embedded,
          embeddedAt: new Date(),
        },
      });

      this.logger.log(`Item #${itemId} — embedded ${embedded}/${chunks.length} chunks successfully`);
    } catch (err) {
      this.logger.error(`knowledge.import.embed failed for item #${itemId}: ${err.message}`, err.stack);
      await this.prisma.userKnowledgeItem.update({
        where: { id: itemId },
        data: { status: 'ERROR' },
      });
      throw err;
    }
  }
}
