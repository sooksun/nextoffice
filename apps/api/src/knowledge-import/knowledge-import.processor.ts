import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import { randomUUID } from 'crypto';
import { fork } from 'child_process';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
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
    private readonly embedding: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    private readonly chunking: ChunkingService,
    private readonly gemini: GeminiApiService,
    private readonly config: ConfigService,
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
        // ── Run OCR in a SEPARATE child process ──────────────────────────────────
        //
        // Why child process instead of inline?
        //   NestJS DI container occupies ~88 MB of regular old-space permanently.
        //   pdf-parse (pdf.js) creates 15-25 MB of intermediate JS objects during parsing.
        //   Together they exceed V8's auto-sized initial heap limit (~113 MB for a
        //   4 GB container), causing "ineffective mark-compacts" OOM on the very next
        //   allocation after OCR completes.
        //
        //   A child process starts with ~20 MB baseline (no NestJS DI overhead) and
        //   has the full --max-old-space-size headroom for OCR work. When it exits,
        //   the OS reclaims all its memory instantly — no GC tuning required.
        this.logger.log(`Item #${itemId} — spawning OCR worker child process`);
        text = await this.runOcrInChildProcess(
          item.storagePath,
          item.mimeType ?? 'application/octet-stream',
          item.sourceType,
        );
        this.logger.log(`Item #${itemId} — OCR complete: ${text.length} chars extracted`);
      }

      if (!text || text.trim().length < 10) {
        await this.prisma.userKnowledgeItem.update({
          where: { id: itemId },
          data: { status: 'ERROR', errorMessage: 'Extracted text too short or empty' },
        });
        this.logger.warn(`Item #${itemId} — extracted text too short, marking ERROR`);
        return;
      }

      // Save extracted text to DB
      await this.prisma.userKnowledgeItem.update({
        where: { id: itemId },
        data: { extractedText: text },
      });

      // Chunk the text
      const chunks = this.chunking.splitText(text);
      this.logger.log(`Item #${itemId} — split into ${chunks.length} chunks`);

      // Remove old Qdrant vectors before re-embedding (prevents duplication on retry)
      if (item.chunkCount > 0) {
        await this.vectorStore.deleteByItemId(item.id).catch((e) =>
          this.logger.warn(`Qdrant cleanup failed for item #${itemId}: ${e.message}`),
        );
      }

      // Batch embed — 1 API call per 100 chunks
      const t0 = Date.now();
      const vectors = await this.embedding.embedBatchParallel(chunks);
      this.logger.log(`Item #${itemId} — batch-embedded ${chunks.length} chunks in ${Date.now() - t0}ms`);

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

      // Batch upsert to Qdrant
      const t1 = Date.now();
      await this.vectorStore.upsertBatch(COLLECTION_KNOWLEDGE, points);
      this.logger.log(`Item #${itemId} — upserted ${points.length} vectors to Qdrant in ${Date.now() - t1}ms`);

      await this.prisma.userKnowledgeItem.update({
        where: { id: itemId },
        data: {
          status: 'DONE',
          chunkCount: points.length,
          embeddedAt: new Date(),
        },
      });

      this.logger.log(`Item #${itemId} — DONE (${points.length}/${chunks.length} chunks embedded)`);
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
   * Fork a child process to run OCR.
   * The child has its own fresh V8 heap (~20 MB baseline, no NestJS DI overhead).
   * All pdf-parse / Gemini response objects live only in the child's heap.
   * When the child exits, the OS reclaims its memory instantly.
   */
  private runOcrInChildProcess(storagePath: string, mimeType: string, sourceType: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // __dirname in compiled code: dist/src/knowledge-import/
      // __dirname in dev (ts-node): src/knowledge-import/
      // ocr-worker.js is copied to dist/src/knowledge-import/ by nest-cli.json assets
      const workerPath = path.join(__dirname, 'ocr-worker.js');

      const child = fork(workerPath, [], {
        // Give the child plenty of heap for OCR — it has no NestJS overhead
        execArgv: ['--max-old-space-size=512'],
        // Silence child stdout/stderr if needed; inherit for now so logs show
        silent: false,
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('OCR worker timed out after 120s'));
      }, 120_000);

      child.on('message', (msg: { ok: boolean; text?: string; error?: string }) => {
        clearTimeout(timeout);
        if (msg.ok) {
          resolve(msg.text ?? '');
        } else {
          reject(new Error(`OCR worker error: ${msg.error}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on('exit', (code, signal) => {
        clearTimeout(timeout);
        if (code !== 0 && signal !== 'SIGTERM') {
          // Only reject if not already resolved/rejected via 'message'
          // (exit fires after message in normal flow)
        }
      });

      // Send OCR task to child
      child.send({
        storagePath,
        mimeType,
        sourceType,
        minioConfig: {
          endpoint: this.config.get('MINIO_ENDPOINT', 'localhost'),
          port: Number(this.config.get('MINIO_PORT', 9000)),
          useSSL: this.config.get('MINIO_USE_SSL', 'false') === 'true',
          accessKey: this.config.get('MINIO_ACCESS_KEY', 'minioadmin'),
          secretKey: this.config.get('MINIO_SECRET_KEY', 'minioadmin'),
          bucket: this.config.get('MINIO_BUCKET', 'nextoffice'),
        },
        geminiApiKey: this.gemini.getApiKey(),
        geminiModel: this.gemini.getModel(),
      });
    });
  }
}
