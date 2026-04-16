import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import * as path from 'path';
import * as v8 from 'v8';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiApiService } from '../gemini/gemini-api.service';
import { FileStorageService } from '../intake/services/file-storage.service';
import { QUEUE_AI_PROCESSING } from '../queue/queue.constants';

/**
 * KnowledgeImportProcessor — runs the OCR→chunk→embed→Qdrant pipeline
 * INLINE in the parent process (no child_process.fork).
 *
 * Why no fork(): V8 idle GC shrinks committed heap to live×1.05 between jobs.
 * When fork() is called, the tiny allocation for process creation triggers
 * major GC, finds 0 bytes freeable (NestJS DI all live), cascades to 3×
 * ineffective mark-compact → FATAL OOM. This happened with every approach:
 * heap anchors, keepalive intervals, pre-fork GC — none reliably prevents
 * V8 from shrinking committed heap during long idle periods.
 *
 * The worker (knowledge-worker.js) uses ONLY Node.js built-in modules
 * (https, crypto, http) which are already loaded by NestJS. Running inline
 * adds zero module-loading overhead and ~1 MB of temporary data per job.
 */
@Processor(QUEUE_AI_PROCESSING)
export class KnowledgeImportProcessor {
  private readonly logger = new Logger(KnowledgeImportProcessor.name);
  private workerModule: { processItem: (msg: any) => Promise<any> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiApiService,
    private readonly config: ConfigService,
    private readonly storage: FileStorageService,
  ) {}

  private logHeap(label: string) {
    const stats = v8.getHeapStatistics();
    const mem = process.memoryUsage();
    this.logger.warn(
      `[HEAP] ${label}: ` +
      `used=${(mem.heapUsed / 1048576).toFixed(0)}MB ` +
      `committed=${(mem.heapTotal / 1048576).toFixed(0)}MB ` +
      `limit=${(stats.heap_size_limit / 1048576).toFixed(0)}MB ` +
      `rss=${(mem.rss / 1048576).toFixed(0)}MB ` +
      `external=${(mem.external / 1048576).toFixed(0)}MB`,
    );
  }

  @Process({ name: 'knowledge.import.embed', concurrency: 1 })
  async handleEmbed(job: Job<{ itemId: string }>) {
    const itemId = BigInt(job.data.itemId);
    this.logHeap(`job-start item#${itemId}`);
    this.logger.log(`Processing knowledge.import.embed for item #${itemId}`);

    const item = await this.prisma.userKnowledgeItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      this.logger.warn(`UserKnowledgeItem #${itemId} not found — skipping`);
      return;
    }

    await this.prisma.userKnowledgeItem.update({
      where: { id: itemId },
      data: { status: 'PROCESSING' },
    });

    try {
      // Download file (parent has MinIO client already loaded)
      let fileBase64: string | null = null;
      if (!item.extractedText && item.storagePath) {
        this.logHeap(`pre-download item#${itemId}`);
        this.logger.log(`Item #${itemId} — downloading file from MinIO`);
        const buffer = await this.storage.getBuffer(item.storagePath);
        fileBase64 = buffer.toString('base64');
        this.logger.log(
          `Item #${itemId} — file downloaded: ${(buffer.length / 1024).toFixed(1)} KB`,
        );
        this.logHeap(`post-download item#${itemId}`);
      }

      // Run worker INLINE — no fork(), no IPC, no heap pressure
      this.logger.log(`Item #${itemId} — running inline worker`);
      const result = await this.runWorkerInline(item, fileBase64);

      this.logger.log(
        `Item #${itemId} — worker complete: ${result.chunkCount} chunks embedded`,
      );

      await this.prisma.userKnowledgeItem.update({
        where: { id: itemId },
        data: {
          status: 'DONE',
          chunkCount: result.chunkCount,
          embeddedAt: new Date(),
          extractedText: result.extractedText || item.extractedText,
        },
      });

      this.logger.log(`Item #${itemId} — DONE`);

      // Release file buffer and nudge GC
      fileBase64 = null;
      if (typeof (global as any).gc === 'function') {
        (global as any).gc();
      }
    } catch (err) {
      this.logger.error(
        `knowledge.import.embed failed for item #${itemId}: ${err.message}`,
        err.stack,
      );
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
   * Runs the knowledge-worker pipeline inline (same V8 heap, same process).
   * The worker uses only Node.js built-ins (https, crypto, http) — all already
   * loaded by NestJS — so require() is essentially a no-op (cached modules).
   * Memory overhead per job: < 2 MB (file base64 + OCR text + embeddings).
   */
  private async runWorkerInline(
    item: any,
    fileBase64: string | null,
  ): Promise<{ extractedText: string; chunkCount: number }> {
    // Lazy-load worker module (require cache means only loaded once)
    if (!this.workerModule) {
      const workerPath = path.join(__dirname, 'knowledge-worker.js');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.workerModule = require(workerPath);
    }

    const qdrantHost = this.config.get('QDRANT_HOST', 'localhost');
    const qdrantPort = this.config.get('QDRANT_PORT', 6333);

    // Race with 150 s timeout
    const result = await Promise.race([
      this.workerModule!.processItem({
        fileBase64,
        mimeType: item.mimeType ?? 'application/octet-stream',
        sourceType: item.sourceType,
        existingText: item.extractedText ?? '',
        itemId: item.id.toString(),
        organizationId: item.organizationId.toString(),
        title: item.title,
        category: item.category ?? '',
        chunkCount: item.chunkCount ?? 0,
        geminiApiKey: this.gemini.getApiKey(),
        geminiModel: this.gemini.getModel(),
        qdrantUrl: `http://${qdrantHost}:${qdrantPort}`,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Knowledge worker timed out after 150s')),
          150_000,
        ),
      ),
    ]);

    return result;
  }
}
