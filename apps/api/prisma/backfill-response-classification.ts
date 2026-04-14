/**
 * Backfill script: Classify response requirement for all existing DocumentAiResult
 * ที่ยังไม่ได้ classify (responseType IS NULL)
 *
 * วิธีรัน:
 *   cd apps/api
 *   GEMINI_API_KEY=xxx DATABASE_URL=... npx ts-node prisma/backfill-response-classification.ts
 *
 * Optional env:
 *   BATCH_SIZE   = จำนวนต่อ batch (default 5)
 *   BATCH_DELAY  = ms ระหว่าง batch (default 1500)
 *   LIMIT        = จำกัดจำนวน (default ทุกอัน)
 */
import { PrismaClient } from '../generated/prisma';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { ResponseRequirementClassifierService } from '../src/ai/services/response-requirement-classifier.service';
import { GeminiApiService } from '../src/gemini/gemini-api.service';

const dbUrl = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/nextoffice_db';
const adapter = new PrismaMariaDb(dbUrl);
const prisma = new PrismaClient({ adapter } as any);

const fakeConfig: any = {
  get: (key: string, def?: any) => process.env[key] ?? def,
};
const gemini = new GeminiApiService(fakeConfig);
const classifier = new ResponseRequirementClassifierService(gemini);

const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 5;
const BATCH_DELAY = Number(process.env.BATCH_DELAY) || 1500;
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Missing GEMINI_API_KEY env');
    process.exit(1);
  }

  const targets = await prisma.documentAiResult.findMany({
    where: {
      responseType: null,
      OR: [
        { extractedText: { not: null } },
        { summaryText: { not: null } },
      ],
    },
    select: {
      id: true,
      documentIntakeId: true,
      subjectText: true,
      summaryText: true,
      extractedText: true,
      nextActionJson: true,
    },
    orderBy: { id: 'asc' },
    take: LIMIT,
  });

  console.log(`📊 Found ${targets.length} DocumentAiResult to classify`);
  if (targets.length === 0) return;

  let classified = 0;
  let failed = 0;
  const counts: Record<string, number> = {};

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    console.log(`\n--- Batch ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1}-${i + batch.length}/${targets.length}) ---`);

    const results = await Promise.all(
      batch.map(async (ai) => {
        try {
          const result = await classifier.classify({
            subjectText: ai.subjectText,
            summaryText: ai.summaryText,
            extractedText: ai.extractedText,
            nextActionJson: ai.nextActionJson,
          });
          return { ai, result, error: null };
        } catch (err: any) {
          return { ai, result: null, error: err };
        }
      }),
    );

    // Apply updates sequentially (cheap DB ops)
    for (const { ai, result, error } of results) {
      if (error || !result) {
        failed++;
        console.log(`  ❌ #${ai.id} (intake ${ai.documentIntakeId}): ${error?.message ?? 'no result'}`);
        continue;
      }

      // 1. Update DocumentAiResult
      await prisma.documentAiResult.update({
        where: { id: ai.id },
        data: {
          responseType: result.responseType,
          responseTypeConfidence: result.confidence,
          responseRequirementReason: result.reason,
        },
      });

      // 2. Find related InboundCase via description LIKE '%intake:{id}%'
      // (pattern same as cases.service.ts:246)
      const intakeIdStr = String(ai.documentIntakeId);
      const cases = await prisma.inboundCase.findMany({
        where: { description: { contains: `intake:${intakeIdStr}` } },
        select: { id: true },
      });
      if (cases.length > 0) {
        await prisma.inboundCase.updateMany({
          where: { id: { in: cases.map((c) => c.id) } },
          data: {
            responseType: result.responseType,
            requiresResponse: result.responseType !== 'informational',
          },
        });
      }

      classified++;
      counts[result.responseType] = (counts[result.responseType] ?? 0) + 1;
      console.log(
        `  ✓ #${ai.id} (intake ${ai.documentIntakeId}) → ${result.responseType} ` +
        `(conf=${result.confidence.toFixed(2)}, ${cases.length} case linked)`,
      );
    }

    if (i + BATCH_SIZE < targets.length) {
      await sleep(BATCH_DELAY);
    }
  }

  console.log('\n═════════════════════════════════════════');
  console.log('Backfill complete');
  console.log(`  Classified: ${classified}`);
  console.log(`  Failed:     ${failed}`);
  console.log('  Distribution:');
  for (const [type, count] of Object.entries(counts)) {
    console.log(`    ${type}: ${count}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
