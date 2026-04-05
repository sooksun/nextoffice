import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService, COLLECTION_DOCUMENTS } from './vector-store.service';
import { randomUUID } from 'crypto';

const CHUNK_SIZE = 800;   // target tokens (approx chars ÷ 1.5 for Thai)
const OVERLAP_CHARS = 150;

@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
  ) {}

  /** Split text into overlapping chunks of ~CHUNK_SIZE chars */
  splitText(text: string): string[] {
    const chunkCharSize = CHUNK_SIZE * 1.5; // rough char estimate
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkCharSize, text.length);
      // Try to break at sentence boundary (Thai ฯ or newline)
      let breakPoint = end;
      if (end < text.length) {
        const sub = text.substring(start, end);
        const lastBreak = Math.max(
          sub.lastIndexOf('\n'),
          sub.lastIndexOf('ฯ'),
          sub.lastIndexOf('。'),
          sub.lastIndexOf('. '),
        );
        if (lastBreak > chunkCharSize * 0.5) {
          breakPoint = start + lastBreak + 1;
        }
      }
      chunks.push(text.substring(start, breakPoint).trim());
      start = breakPoint - OVERLAP_CHARS;
      if (start < 0) start = 0;
      if (start >= text.length) break;
    }
    return chunks.filter((c) => c.length > 10);
  }

  /** Chunk a Document, embed each chunk, store in Qdrant + update DocumentChunk rows */
  async processDocument(documentId: number): Promise<{ chunksCreated: number; chunksEmbedded: number }> {
    const doc = await this.prisma.document.findUnique({
      where: { id: BigInt(documentId) },
      include: { documentChunks: true },
    });
    if (!doc || !doc.fullText) return { chunksCreated: 0, chunksEmbedded: 0 };

    const texts = this.splitText(doc.fullText);
    let chunksCreated = 0;
    let chunksEmbedded = 0;

    for (let i = 0; i < texts.length; i++) {
      const chunkText = texts[i];

      // Upsert DocumentChunk row
      const existing = doc.documentChunks.find((c) => c.chunkIndex === i);
      let chunk = existing;
      if (!chunk) {
        chunk = await this.prisma.documentChunk.create({
          data: {
            documentId: BigInt(documentId),
            chunkIndex: i,
            chunkText,
            tokenCount: Math.round(chunkText.length / 1.5),
          },
        });
        chunksCreated++;
      }

      // Embed and store in Qdrant
      try {
        const vector = await this.embedding.embed(chunkText);
        if (!vector.length) continue;

        const pointId = randomUUID();
        await this.vectorStore.upsert(COLLECTION_DOCUMENTS, pointId, vector, {
          documentId,
          chunkId: Number(chunk.id),
          chunkIndex: i,
          documentType: doc.documentType,
          sourceType: doc.sourceType,
          text: chunkText.substring(0, 500), // store snippet for inspection
        });

        // Update chunk with Qdrant reference
        await this.prisma.documentChunk.update({
          where: { id: chunk.id },
          data: {
            qdrantPointId: pointId,
            embeddingModel: this.embedding.modelName,
            embeddedAt: new Date(),
          },
        });
        chunksEmbedded++;
      } catch (err) {
        this.logger.warn(`Failed to embed chunk ${i} of doc ${documentId}: ${err.message}`);
      }
    }

    return { chunksCreated, chunksEmbedded };
  }

  /** Embed a knowledge item (PolicyClause or HorizonPractice) and store in knowledge collection */
  async embedKnowledgeItem(
    sourceType: 'policy_clause' | 'horizon_practice',
    sourceId: number,
    text: string,
  ): Promise<string | null> {
    try {
      const vector = await this.embedding.embed(text);
      if (!vector.length) return null;

      const pointId = randomUUID();
      await this.vectorStore.upsert('knowledge', pointId, vector, {
        sourceType,
        sourceId,
        text: text.substring(0, 500),
      });

      // Remove old embedding record if any, then create fresh
      await this.prisma.knowledgeEmbedding.deleteMany({
        where: { sourceType, sourceId: BigInt(sourceId) },
      });
      await this.prisma.knowledgeEmbedding.create({
        data: {
          sourceType,
          sourceId: BigInt(sourceId),
          qdrantPointId: pointId,
          collection: 'knowledge',
          embeddingModel: this.embedding.modelName,
          embeddedAt: new Date(),
        },
      });
      return pointId;
    } catch (err) {
      this.logger.warn(`Failed to embed ${sourceType} ${sourceId}: ${err.message}`);
      return null;
    }
  }
}
