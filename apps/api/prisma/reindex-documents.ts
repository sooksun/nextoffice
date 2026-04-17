/**
 * Re-index documents: ใช้ ThaiStructureParser ตัด chunk ใหม่ + embed + ส่งเข้า Qdrant
 *
 * วิธีรัน:
 *   cd apps/api
 *   npx ts-node prisma/reindex-documents.ts                       # ทุก document
 *   npx ts-node prisma/reindex-documents.ts --limit=10            # 10 ฉบับแรก
 *   npx ts-node prisma/reindex-documents.ts --source=sarabun      # เฉพาะ sourceType
 *   npx ts-node prisma/reindex-documents.ts --type=regulation     # เฉพาะ documentType
 *   npx ts-node prisma/reindex-documents.ts --id=123              # เฉพาะ document ID
 *   npx ts-node prisma/reindex-documents.ts --dry-run             # แสดง chunks ที่จะสร้าง ไม่เขียน DB
 *
 * ต้องมี env:
 *   DATABASE_URL, GEMINI_API_KEY, QDRANT_HOST, QDRANT_PORT
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ChunkingService } from '../src/rag/services/chunking.service';
import { ThaiStructureParserService } from '../src/rag/services/thai-structure-parser.service';
import { EmbeddingService } from '../src/rag/services/embedding.service';
import { VectorStoreService } from '../src/rag/services/vector-store.service';

// Minimal module — only the services reindex actually uses.
// Skips RagModule entirely to avoid pulling unrelated deps (ReasoningService,
// SystemPromptsService, GeminiApiService, etc.) that need their own wiring.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  providers: [
    EmbeddingService,
    VectorStoreService,
    ThaiStructureParserService,
    ChunkingService,
  ],
})
class ReindexModule {}

interface Options {
  limit?: number;
  sourceType?: string;
  documentType?: string;
  documentId?: bigint;
  dryRun: boolean;
  delay: number;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { dryRun: false, delay: 200 };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('--limit=')) opts.limit = Number(a.split('=')[1]);
    else if (a.startsWith('--source=')) opts.sourceType = a.split('=')[1];
    else if (a.startsWith('--type=')) opts.documentType = a.split('=')[1];
    else if (a.startsWith('--id=')) opts.documentId = BigInt(a.split('=')[1]);
    else if (a.startsWith('--delay=')) opts.delay = Number(a.split('=')[1]);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  const logger = new Logger('Reindex');

  const app = await NestFactory.createApplicationContext(ReindexModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();

  const prisma = app.get(PrismaService);
  const chunking = app.get(ChunkingService);
  const parser = app.get(ThaiStructureParserService);

  const where: any = {
    fullText: { not: null },
  };
  if (opts.sourceType) where.sourceType = opts.sourceType;
  if (opts.documentType) where.documentType = opts.documentType;
  if (opts.documentId) where.id = opts.documentId;

  const docs = await prisma.document.findMany({
    where,
    select: { id: true, title: true, documentType: true, sourceType: true, fullText: true },
    orderBy: { id: 'asc' },
    take: opts.limit,
  });

  logger.log(`พบ ${docs.length} documents ที่จะ re-index`);
  if (opts.dryRun) logger.warn('DRY-RUN mode: จะไม่มีการเขียน DB หรือ Qdrant');

  let totalCreated = 0;
  let totalEmbedded = 0;
  let totalDeleted = 0;
  let failed = 0;
  const skipped: Array<{ id: bigint; reason: string }> = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const label = `[${i + 1}/${docs.length}] doc#${doc.id} ${(doc.title ?? '').slice(0, 60)}`;

    if (!doc.fullText || doc.fullText.length < 50) {
      logger.warn(`${label} — ข้าม (fullText สั้นเกิน)`);
      skipped.push({ id: doc.id, reason: 'fullText too short' });
      continue;
    }

    if (opts.dryRun) {
      // ใช้ parser ตรง ๆ แสดงว่าจะตัด chunk แบบไหน
      const parsed = parser.parse(doc.fullText);
      const chunks = chunking.splitStructured(doc.fullText, doc.title ?? undefined);
      logger.log(
        `${label} — structure=${parsed.hasStructure} blocks=${parsed.blocks.length} chunks=${chunks.length}`,
      );
      if (chunks.length > 0) {
        const sample = chunks[0];
        logger.log(
          `   └ sample: [${sample.semanticLabel ?? '-'}] ${sample.sectionTitle ?? '-'} ` +
          `(${sample.tokenCount} tokens)`,
        );
      }
      continue;
    }

    try {
      const result = await chunking.processDocument(Number(doc.id), { reindex: true });
      totalCreated += result.chunksCreated;
      totalEmbedded += result.chunksEmbedded;
      totalDeleted += result.chunksDeleted;
      logger.log(
        `${label} — deleted=${result.chunksDeleted} created=${result.chunksCreated} embedded=${result.chunksEmbedded}`,
      );
    } catch (err: any) {
      failed++;
      logger.error(`${label} — FAILED: ${err?.message ?? err}`);
    }

    if (opts.delay > 0 && i < docs.length - 1) {
      await new Promise((r) => setTimeout(r, opts.delay));
    }
  }

  logger.log('');
  logger.log('═══════════════════════════════════════════');
  logger.log(`สรุป: documents=${docs.length} created=${totalCreated} embedded=${totalEmbedded} deleted=${totalDeleted} failed=${failed} skipped=${skipped.length}`);
  logger.log('═══════════════════════════════════════════');

  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
