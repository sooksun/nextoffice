import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { randomUUID } from 'crypto';
import axios from 'axios';
import * as FormData from 'form-data';
import * as pdfParse from 'pdf-parse';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../intake/services/file-storage.service';
import { EmbeddingService } from '../rag/services/embedding.service';
import { VectorStoreService, COLLECTION_KNOWLEDGE } from '../rag/services/vector-store.service';
import { ChunkingService } from '../rag/services/chunking.service';
import { GeminiApiService } from '../gemini/gemini-api.service';
import { QUEUE_AI_PROCESSING } from '../queue/queue.constants';

/**
 * Threshold (bytes): files larger than this use Gemini File API instead of inline base64.
 * PDFs always go through File API regardless of size (avoids keeping large base64 in V8 heap
 * which prevents GC before chunking and causes OOM).
 */
const INLINE_SIZE_LIMIT = 2 * 1024 * 1024; // 2 MB (images only)

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

  @Process({ name: 'knowledge.import.embed', concurrency: 1 })
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
        // Run OCR in an isolated method so all large locals (buffer, base64, axios response)
        // go out of scope when the method returns, allowing V8 to GC them before chunking.
        text = await this.runOcr(item.storagePath, item.mimeType ?? 'application/octet-stream', item.sourceType);
        // runOcr's scope is now gone → base64/buffer/axios response are unreachable.
        // Force a GC cycle to reclaim them before chunking allocates new objects.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (global as any).gc === 'function') (global as any).gc();
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

      // Log heap usage for diagnosis
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const v8stats = require('v8').getHeapStatistics();
      const heap = process.memoryUsage();
      this.logger.log(
        `Item #${itemId} heap: rss=${Math.round(heap.rss / 1024 / 1024)}MB used=${Math.round(heap.heapUsed / 1024 / 1024)}MB total=${Math.round(heap.heapTotal / 1024 / 1024)}MB limit=${Math.round(v8stats.heap_size_limit / 1024 / 1024)}MB`,
      );

      // Save extracted text
      this.logger.log(`Item #${itemId} — saving extractedText to DB`);
      await this.prisma.userKnowledgeItem.update({
        where: { id: itemId },
        data: { extractedText: text },
      });

      // Chunk the text
      this.logger.log(`Item #${itemId} — chunking text`);
      const chunks = this.chunking.splitText(text);
      this.logger.log(`Split into ${chunks.length} chunks for item #${itemId}`);

      // Remove old Qdrant vectors before re-embedding (prevents duplication on retry)
      if (item.chunkCount > 0) {
        await this.vectorStore.deleteByItemId(item.id).catch((e) =>
          this.logger.warn(`Qdrant cleanup failed for item #${itemId}: ${e.message}`),
        );
      }

      // Batch embed — 1 API call per 100 chunks (50-100x faster than sequential)
      const t0 = Date.now();
      const vectors = await this.embedding.embedBatchParallel(chunks);
      this.logger.log(`Batch-embedded ${chunks.length} chunks in ${Date.now() - t0}ms for item #${itemId}`);

      // Build points array (skip empty vectors)
      const points = [];
      for (let i = 0; i < chunks.length; i++) {
        if (!vectors[i] || vectors[i].length === 0) continue;
        points.push({
          id: randomUUID(),
          vector: vectors[i],
          payload: {
            sourceType: 'user_knowledge',
            itemId: item.id.toString(),
            organizationId: item.organizationId.toString(),
            title: item.title,
            category: item.category ?? '',
            chunkIndex: i,
            text: chunks[i].substring(0, 500),
          },
        });
      }

      // Batch upsert to Qdrant — 1 call for all points
      const t1 = Date.now();
      await this.vectorStore.upsertBatch(COLLECTION_KNOWLEDGE, points);
      this.logger.log(`Upserted ${points.length} vectors to Qdrant in ${Date.now() - t1}ms for item #${itemId}`);
      const embedded = points.length;

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
        data: {
          status: 'ERROR',
          errorMessage: err?.message?.substring(0, 500) ?? 'Unknown error',
        },
      });
      throw err;
    }
  }

  /**
   * Run OCR/extraction on a stored file.
   *
   * Strategy (memory-efficient, no large V8 heap allocations):
   *  1. PDF → pdf-parse (pure JS, extracts embedded text; zero network calls, zero base64)
   *     If pdf-parse yields too little text (scanned PDF), fall through to Gemini File API.
   *  2. Large image or scanned PDF → Gemini File API (upload first, reference by URI)
   *  3. Small image → inline base64 via Gemini (last resort, images are typically < 500KB)
   *
   * Isolated into its own method so all temporaries (buffer, base64, axios response)
   * become unreachable when this method returns → V8 can GC before chunking starts.
   */
  private async runOcr(storagePath: string, mimeType: string, sourceType: string): Promise<string> {
    const buffer: Buffer = await this.storage.getBuffer(storagePath);
    const bufferLen = buffer.length;

    // ── 1. Text-based PDF: use pdf-parse (CPU only, no heap spike) ──────────────
    if (mimeType === 'application/pdf') {
      try {
        this.logger.log(`OCR: ${(bufferLen / 1024 / 1024).toFixed(2)}MB PDF — trying pdf-parse`);
        const parsed = await pdfParse(buffer);
        const pdfText = parsed.text?.trim() ?? '';
        if (pdfText.length >= 50) {
          this.logger.log(`pdf-parse extracted ${pdfText.length} chars (${parsed.numpages} pages)`);
          return pdfText;
        }
        this.logger.log(`pdf-parse returned only ${pdfText.length} chars — likely scanned, falling back to Gemini`);
      } catch (err: any) {
        this.logger.warn(`pdf-parse failed: ${err.message} — falling back to Gemini`);
      }
    }

    // ── 2. Scanned PDF / Image: Gemini (File API for large, inline for small) ──
    const prompt = sourceType === 'pdf'
      ? 'สกัดข้อความทั้งหมดจากเอกสาร PDF นี้ให้ครบถ้วน รักษาโครงสร้างและหัวข้อให้ชัดเจน'
      : 'อธิบายและสกัดข้อความทั้งหมดในภาพนี้ ให้ครอบคลุมทุกข้อมูลที่มองเห็น';
    const system = 'คุณคือผู้ช่วย OCR/extraction ที่แม่นยำ ให้ข้อความที่สกัดได้เท่านั้น ไม่ต้องอธิบายเพิ่มเติม';

    if (bufferLen > INLINE_SIZE_LIMIT) {
      this.logger.log(`OCR: ${(bufferLen / 1024 / 1024).toFixed(1)}MB — Gemini File API`);
      const fileUri = await this.uploadToGeminiFileApi(buffer, mimeType);
      return this.gemini.generateFromParts({
        system,
        parts: [{ fileData: { mimeType, fileUri } } as any, { text: prompt }],
        maxOutputTokens: 8192,
      });
    }

    // Small image: inline base64 (buffer released after this method returns)
    this.logger.log(`OCR: ${(bufferLen / 1024 / 1024).toFixed(2)}MB image — Gemini inline`);
    const base64 = buffer.toString('base64');
    return this.gemini.generateFromParts({
      system,
      parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }],
      maxOutputTokens: 8192,
    });
  }

  /**
   * Upload a file buffer to the Gemini File API and return the fileUri.
   * This avoids loading large files as inline base64 in the request body,
   * which can cause Node.js heap OOM for PDFs > 2MB.
   */
  private async uploadToGeminiFileApi(buffer: Buffer, mimeType: string): Promise<string> {
    const apiKey = this.gemini.getApiKey();
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const form = new FormData();
    form.append('file', buffer, { filename: 'document', contentType: mimeType });

    const uploadRes = await axios.post(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 60000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
      },
    );

    const fileUri: string = uploadRes.data?.file?.uri;
    if (!fileUri) throw new Error('Gemini File API did not return a fileUri');
    this.logger.log(`Gemini File API uploaded: ${fileUri}`);
    return fileUri;
  }
}
