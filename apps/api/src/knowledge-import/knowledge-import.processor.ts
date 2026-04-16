import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import { fork } from 'child_process';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiApiService } from '../gemini/gemini-api.service';
import { FileStorageService } from '../intake/services/file-storage.service';
import { QUEUE_AI_PROCESSING } from '../queue/queue.constants';

/**
 * KnowledgeImportProcessor — parent does only DB + file download.
 * ALL compute work (OCR, chunk, embed, Qdrant) runs in a child process.
 *
 * Key insight: previous child OOMed because it loaded minio SDK (~100 MB)
 * and pdf-parse/pdf.js (~150 MB) = 250 MB just from require() before any work.
 *
 * Fix: parent downloads the file (it already has MinIO client) and sends
 * raw base64 to child via IPC. Child loads only: axios + form-data + crypto
 * ≈ 26 MB of modules, leaving 374 MB headroom in the 400 MB child heap.
 */
@Processor(QUEUE_AI_PROCESSING)
export class KnowledgeImportProcessor {
  private readonly logger = new Logger(KnowledgeImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiApiService,
    private readonly config: ConfigService,
    private readonly storage: FileStorageService,
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
      // Download file in parent process (has MinIO client, ~270 KB for this PDF)
      // and send as base64 to child. This avoids loading the heavy minio SDK
      // (~100 MB) and pdf-parse/pdf.js (~150 MB) inside the child process.
      let fileBase64: string | null = null;
      if (!item.extractedText && item.storagePath) {
        this.logger.log(`Item #${itemId} — downloading file from MinIO`);
        const buffer = await this.storage.getBuffer(item.storagePath);
        fileBase64 = buffer.toString('base64');
        this.logger.log(`Item #${itemId} — file downloaded: ${(buffer.length / 1024).toFixed(1)} KB, spawning worker`);
      } else {
        this.logger.log(`Item #${itemId} — using existing extracted text, spawning worker`);
      }

      const result = await this.runWorkerInChildProcess(item, fileBase64);

      this.logger.log(`Item #${itemId} — worker complete: ${result.chunkCount} chunks embedded`);

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

  private runWorkerInChildProcess(
    item: any,
    fileBase64: string | null,
  ): Promise<{ extractedText: string; chunkCount: number }> {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, 'knowledge-worker.js');

      // Clear NODE_OPTIONS so parent's --max-old-space-size is NOT inherited.
      const childEnv = { ...process.env, NODE_OPTIONS: '' };

      const child = fork(workerPath, [], {
        execArgv: ['--max-old-space-size=400'],
        env: childEnv,
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

      const qdrantHost = this.config.get('QDRANT_HOST', 'localhost');
      const qdrantPort = this.config.get('QDRANT_PORT', 6333);

      child.send({
        fileBase64,                             // null if existingText is set
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
      });
    });
  }
}
