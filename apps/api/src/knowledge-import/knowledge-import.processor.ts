import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import { fork } from 'child_process';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiApiService } from '../gemini/gemini-api.service';
import { QUEUE_AI_PROCESSING } from '../queue/queue.constants';

/**
 * KnowledgeImportProcessor — minimal parent-side handler.
 *
 * ALL heavy work (download, OCR, chunking, embedding, Qdrant upsert) runs
 * inside a child_process.fork() via knowledge-worker.js.
 *
 * Why: NestJS DI container occupies ~88 MB of permanent V8 old-space.
 * Running OCR + pdf-parse + Gemini embedding + Qdrant in the same process
 * caused "Reached heap limit" OOM regardless of max-old-space-size tuning.
 *
 * With child process isolation:
 *   - Parent heap stays at ~88 MB (NestJS DI) + tiny DB query objects
 *   - Child has its own 512 MB heap for all heavy operations
 *   - OS reclaims child memory instantly on process.exit(0)
 *   - No GC pressure in parent, no OOM possible from job processing
 */
@Processor(QUEUE_AI_PROCESSING)
export class KnowledgeImportProcessor {
  private readonly logger = new Logger(KnowledgeImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
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

    await this.prisma.userKnowledgeItem.update({
      where: { id: itemId },
      data: { status: 'PROCESSING' },
    });

    try {
      this.logger.log(`Item #${itemId} — spawning knowledge worker child process`);

      const result = await this.runWorkerInChildProcess(item);

      this.logger.log(`Item #${itemId} — worker complete: ${result.chunkCount} chunks embedded`);

      await this.prisma.userKnowledgeItem.update({
        where: { id: itemId },
        data: {
          status: 'DONE',
          chunkCount: result.chunkCount,
          embeddedAt: new Date(),
          extractedText: result.extractedText ?? item.extractedText,
        },
      });

      this.logger.log(`Item #${itemId} — DONE`);
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
   * Spawn knowledge-worker.js as a child process.
   * Passes all config via IPC message (no shared state).
   * Resolves with { extractedText, chunkCount } on success.
   * Rejects on error, OOM in child, or 150s timeout.
   */
  private runWorkerInChildProcess(item: any): Promise<{ extractedText: string; chunkCount: number }> {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, 'knowledge-worker.js');

      const child = fork(workerPath, [], {
        execArgv: ['--max-old-space-size=512'],
        silent: false,
      });

      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) { settled = true; clearTimeout(timeout); fn(); }
      };

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        settle(() => reject(new Error('Knowledge worker timed out after 150s')));
      }, 150_000);

      child.on('message', (msg: { ok: boolean; extractedText?: string; chunkCount?: number; error?: string }) => {
        if (msg.ok) {
          settle(() => resolve({ extractedText: msg.extractedText ?? '', chunkCount: msg.chunkCount ?? 0 }));
        } else {
          settle(() => reject(new Error(msg.error ?? 'Worker failed')));
        }
      });

      child.on('error', (err) => settle(() => reject(err)));

      child.on('exit', (code, signal) => {
        if (!settled) {
          settle(() => reject(new Error(`Worker exited unexpectedly: code=${code} signal=${signal}`)));
        }
      });

      // Send all data the worker needs
      const qdrantHost = this.config.get('QDRANT_HOST', 'localhost');
      const qdrantPort = this.config.get('QDRANT_PORT', 6333);

      child.send({
        storagePath: item.storagePath,
        mimeType: item.mimeType ?? 'application/octet-stream',
        sourceType: item.sourceType,
        extractedText: item.extractedText ?? '',
        itemId: item.id.toString(),
        organizationId: item.organizationId.toString(),
        title: item.title,
        category: item.category ?? '',
        chunkCount: item.chunkCount ?? 0,
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
        qdrantUrl: `http://${qdrantHost}:${qdrantPort}`,
      });
    });
  }
}
