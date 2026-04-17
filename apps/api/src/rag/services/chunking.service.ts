import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService, COLLECTION_DOCUMENTS } from './vector-store.service';
import { ThaiStructureParserService, StructuredBlock } from './thai-structure-parser.service';
import { randomUUID } from 'crypto';

const CHUNK_SIZE = 800;         // target tokens (approx chars ÷ 1.5 for Thai)
const CHUNK_CHAR_SIZE = 1200;   // CHUNK_SIZE * 1.5
const OVERLAP_CHARS = 150;
const MIN_CHUNK_CHARS = 10;

export interface StructuredChunk {
  text: string;              // final text including breadcrumb prefix
  rawContent: string;        // content without breadcrumb prefix
  chunkIndex: number;
  sectionTitle?: string;     // last segment of breadcrumb, e.g. "ข้อ 5 การลาออก"
  semanticLabel?: string;    // structure level, e.g. "article", "section", "paragraph"
  breadcrumb?: string[];     // full path ["หมวด 1 บททั่วไป", "ข้อ 5"]
  pageNo?: number;
  tokenCount: number;
}

@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    private readonly parser: ThaiStructureParserService,
  ) {}

  /**
   * Legacy API — returns chunk texts only. Kept for backward compatibility
   * with anything that used the old flat splitter.
   */
  splitText(text: string): string[] {
    return this.splitStructured(text).map((c) => c.text);
  }

  /**
   * Structure-aware chunker for Thai government documents.
   *
   * Strategy:
   *   1. Try ThaiStructureParser — if it finds หมวด/ข้อ/มาตรา/วรรค/(n)/ก.,
   *      each block becomes one chunk (or split into a few if > CHUNK_CHAR_SIZE),
   *      prefixed with its breadcrumb path for retrieval context.
   *   2. If no structure detected (e.g. narrative text, scan OCR), fall back
   *      to sentence-boundary char-based splitting — the previous algorithm.
   */
  splitStructured(text: string, documentTitle?: string): StructuredChunk[] {
    const parsed = this.parser.parse(text);

    if (!parsed.hasStructure || parsed.blocks.length === 0) {
      return this.splitFlat(text, documentTitle);
    }

    const chunks: StructuredChunk[] = [];
    let idx = 0;

    for (const block of parsed.blocks) {
      const headerLine = block.breadcrumb[block.breadcrumb.length - 1] ?? '';
      const body = [headerLine, block.content].filter(Boolean).join('\n');
      if (body.trim().length < MIN_CHUNK_CHARS) continue;

      const prefix = this.formatBreadcrumbPrefix(block.breadcrumb, documentTitle);

      if (body.length <= CHUNK_CHAR_SIZE) {
        chunks.push(this.makeChunk(prefix, body, idx++, block));
      } else {
        // Block is too long — split within block preserving breadcrumb
        const pieces = this.splitLongText(body);
        for (const piece of pieces) {
          chunks.push(this.makeChunk(prefix, piece, idx++, block));
        }
      }
    }

    return this.mergeSmallChunks(chunks);
  }

  // ── Fallback: sentence-boundary char splitting (no structure) ───────
  private splitFlat(text: string, documentTitle?: string): StructuredChunk[] {
    const prefix = documentTitle ? `[${documentTitle}]` : '';
    return this.splitLongText(text).map((piece, i) => ({
      text: prefix ? `${prefix}\n\n${piece}` : piece,
      rawContent: piece,
      chunkIndex: i,
      tokenCount: Math.round(piece.length / 1.5),
    }));
  }

  /**
   * Sentence-boundary splitter for a single long string.
   * Safe against infinite loops (the known-bad pattern from previous impl).
   */
  private splitLongText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + CHUNK_CHAR_SIZE, text.length);
      let breakPoint = end;

      if (end < text.length) {
        const sub = text.substring(start, end);
        const lastBreak = Math.max(
          sub.lastIndexOf('\n'),
          sub.lastIndexOf('ฯ'),
          sub.lastIndexOf('。'),
          sub.lastIndexOf('. '),
        );
        if (lastBreak > CHUNK_CHAR_SIZE * 0.5) {
          breakPoint = start + lastBreak + 1;
        }
      }

      chunks.push(text.substring(start, breakPoint).trim());

      if (breakPoint >= text.length) break; // prevent infinite loop at tail

      start = breakPoint - OVERLAP_CHARS;
      if (start < 0) start = 0;
    }

    return chunks.filter((c) => c.length >= MIN_CHUNK_CHARS);
  }

  private formatBreadcrumbPrefix(breadcrumb: string[], documentTitle?: string): string {
    const parts = documentTitle ? [documentTitle, ...breadcrumb] : breadcrumb;
    return parts.length > 0 ? `[${parts.join(' > ')}]` : '';
  }

  private makeChunk(
    prefix: string,
    body: string,
    chunkIndex: number,
    block: StructuredBlock,
  ): StructuredChunk {
    const text = prefix ? `${prefix}\n\n${body}` : body;
    const sectionTitle = block.breadcrumb[block.breadcrumb.length - 1];
    return {
      text,
      rawContent: body,
      chunkIndex,
      sectionTitle: sectionTitle?.slice(0, 255),
      semanticLabel: block.level,
      breadcrumb: block.breadcrumb,
      pageNo: block.pageNumber,
      tokenCount: Math.round(text.length / 1.5),
    };
  }

  /**
   * Merge small chunks (< 1/4 of target) into their previous sibling when
   * they share the same top-level section. Keeps retrieval units meaningful.
   */
  private mergeSmallChunks(chunks: StructuredChunk[]): StructuredChunk[] {
    const threshold = CHUNK_CHAR_SIZE * 0.25;
    const out: StructuredChunk[] = [];

    for (const c of chunks) {
      const prev = out[out.length - 1];
      if (
        prev &&
        c.text.length < threshold &&
        prev.text.length + c.text.length <= CHUNK_CHAR_SIZE &&
        (prev.breadcrumb?.[0] ?? '') === (c.breadcrumb?.[0] ?? '')
      ) {
        prev.text += `\n\n${c.rawContent}`;
        prev.rawContent += `\n\n${c.rawContent}`;
        prev.tokenCount = Math.round(prev.text.length / 1.5);
      } else {
        out.push({ ...c });
      }
    }

    return out.map((c, i) => ({ ...c, chunkIndex: i }));
  }

  /**
   * Chunk a Document, embed each chunk, store in Qdrant + upsert DocumentChunk rows.
   * When `reindex=true`, delete existing chunks + Qdrant points first.
   */
  async processDocument(
    documentId: number,
    opts: { reindex?: boolean } = {},
  ): Promise<{ chunksCreated: number; chunksEmbedded: number; chunksDeleted: number }> {
    const doc = await this.prisma.document.findUnique({
      where: { id: BigInt(documentId) },
      include: { documentChunks: true },
    });
    if (!doc || !doc.fullText) {
      return { chunksCreated: 0, chunksEmbedded: 0, chunksDeleted: 0 };
    }

    let chunksDeleted = 0;
    if (opts.reindex && doc.documentChunks.length > 0) {
      for (const c of doc.documentChunks) {
        if (c.qdrantPointId) {
          try {
            await this.vectorStore.delete(COLLECTION_DOCUMENTS, c.qdrantPointId);
          } catch (err) {
            this.logger.warn(`Failed to delete Qdrant point ${c.qdrantPointId}: ${err.message}`);
          }
        }
      }
      const res = await this.prisma.documentChunk.deleteMany({
        where: { documentId: BigInt(documentId) },
      });
      chunksDeleted = res.count;
      doc.documentChunks = [];
    }

    const structured = this.splitStructured(doc.fullText, doc.title ?? undefined);
    let chunksCreated = 0;
    let chunksEmbedded = 0;

    for (const sc of structured) {
      const existing = doc.documentChunks.find((c) => c.chunkIndex === sc.chunkIndex);
      let chunk = existing;
      if (!chunk) {
        chunk = await this.prisma.documentChunk.create({
          data: {
            documentId: BigInt(documentId),
            chunkIndex: sc.chunkIndex,
            chunkText: sc.text,
            tokenCount: sc.tokenCount,
            pageNo: sc.pageNo ?? null,
            sectionTitle: sc.sectionTitle ?? null,
            semanticLabel: sc.semanticLabel ?? null,
          },
        });
        chunksCreated++;
      } else {
        chunk = await this.prisma.documentChunk.update({
          where: { id: chunk.id },
          data: {
            chunkText: sc.text,
            tokenCount: sc.tokenCount,
            pageNo: sc.pageNo ?? null,
            sectionTitle: sc.sectionTitle ?? null,
            semanticLabel: sc.semanticLabel ?? null,
          },
        });
      }

      try {
        const vector = await this.embedding.embed(sc.text);
        if (!vector.length) continue;

        const pointId = chunk.qdrantPointId ?? randomUUID();
        await this.vectorStore.upsert(COLLECTION_DOCUMENTS, pointId, vector, {
          documentId,
          chunkId: Number(chunk.id),
          chunkIndex: sc.chunkIndex,
          documentType: doc.documentType,
          sourceType: doc.sourceType,
          sectionTitle: sc.sectionTitle ?? null,
          semanticLabel: sc.semanticLabel ?? null,
          breadcrumb: sc.breadcrumb ?? null,
          text: sc.text.substring(0, 500),
        });

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
        this.logger.warn(`Failed to embed chunk ${sc.chunkIndex} of doc ${documentId}: ${err.message}`);
      }
    }

    return { chunksCreated, chunksEmbedded, chunksDeleted };
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
