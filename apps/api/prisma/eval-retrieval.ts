/**
 * Retrieval evaluation benchmark.
 *
 * Runs each query in eval-dataset.json through the hybrid retrieval pipeline
 * (RRF + MMR) and measures recall@k, precision@k, MRR, and NDCG@k against
 * hand-labeled relevant document IDs.
 *
 * Usage:
 *   cd apps/api
 *   npx ts-node prisma/eval-retrieval.ts                   # default k=6
 *   npx ts-node prisma/eval-retrieval.ts --k=10            # use top-10
 *   npx ts-node prisma/eval-retrieval.ts --dataset=custom.json
 *   npx ts-node prisma/eval-retrieval.ts --json > eval.json # machine-readable
 *
 * Prod (compiled):
 *   node -r dotenv/config dist/prisma/eval-retrieval.js
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { EmbeddingService } from '../src/rag/services/embedding.service';
import { VectorStoreService } from '../src/rag/services/vector-store.service';
import { ThaiTokenizerService } from '../src/rag/services/thai-tokenizer.service';
import { HybridSearchService } from '../src/rag/services/hybrid-search.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  providers: [EmbeddingService, VectorStoreService, ThaiTokenizerService, HybridSearchService],
})
class EvalModule {}

interface EvalQuery {
  id: string;
  query: string;
  relevantDocIds: number[];
  tags?: string[];
}

interface EvalDataset {
  description?: string;
  queries: EvalQuery[];
}

interface QueryResult {
  id: string;
  query: string;
  k: number;
  relevant: number[];
  retrieved: Array<{ docId: number; rank: number; hybridScore: number }>;
  metrics: {
    recallAtK: number;
    precisionAtK: number;
    reciprocalRank: number;
    ndcgAtK: number;
    hits: number;
  };
}

function parseArgs(argv: string[]) {
  const opts = { k: 6, dataset: 'prisma/eval-dataset.json', json: false };
  for (const a of argv.slice(2)) {
    if (a === '--json') opts.json = true;
    else if (a.startsWith('--k=')) opts.k = Number(a.split('=')[1]);
    else if (a.startsWith('--dataset=')) opts.dataset = a.split('=')[1];
  }
  return opts;
}

// ── Metrics ─────────────────────────────────────────────────────────────────
function recallAtK(retrieved: number[], relevant: number[], k: number): number {
  if (relevant.length === 0) return 0;
  const topK = new Set(retrieved.slice(0, k));
  const hits = relevant.filter((id) => topK.has(id)).length;
  return hits / relevant.length;
}

function precisionAtK(retrieved: number[], relevant: number[], k: number): number {
  const topK = retrieved.slice(0, k);
  if (topK.length === 0) return 0;
  const rel = new Set(relevant);
  const hits = topK.filter((id) => rel.has(id)).length;
  return hits / topK.length;
}

function reciprocalRank(retrieved: number[], relevant: number[]): number {
  const rel = new Set(relevant);
  for (let i = 0; i < retrieved.length; i++) {
    if (rel.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

/** NDCG@k with binary relevance. */
function ndcgAtK(retrieved: number[], relevant: number[], k: number): number {
  const rel = new Set(relevant);
  let dcg = 0;
  for (let i = 0; i < Math.min(retrieved.length, k); i++) {
    if (rel.has(retrieved[i])) dcg += 1 / Math.log2(i + 2);
  }
  // ideal DCG: relevant items at positions 0..min(|relevant|, k)-1
  let idcg = 0;
  for (let i = 0; i < Math.min(relevant.length, k); i++) {
    idcg += 1 / Math.log2(i + 2);
  }
  return idcg > 0 ? dcg / idcg : 0;
}

async function main() {
  const opts = parseArgs(process.argv);
  const logger = new Logger('Eval');

  // Load dataset relative to cwd (repo root or apps/api both work)
  const datasetPath = fs.existsSync(opts.dataset)
    ? opts.dataset
    : path.join(__dirname, '..', opts.dataset);
  if (!fs.existsSync(datasetPath)) {
    console.error(`Dataset not found: ${opts.dataset}`);
    process.exit(1);
  }
  const dataset: EvalDataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));

  const app = await NestFactory.createApplicationContext(EvalModule, {
    logger: ['error', 'warn'],
  });
  app.enableShutdownHooks();

  const hybridSearch = app.get(HybridSearchService);
  const K = opts.k;

  const results: QueryResult[] = [];

  for (const q of dataset.queries) {
    const hits = await hybridSearch.search(q.query, K).catch((err) => {
      logger.warn(`Query ${q.id} failed: ${err.message}`);
      return [];
    });

    const retrieved = hits
      .filter((h) => h.sourceType === 'document')
      .map((h, i) => ({
        docId: Number(h.sourceId),
        rank: i + 1,
        hybridScore: h.hybridScore,
      }));
    const retrievedIds = retrieved.map((r) => r.docId);

    const metrics = {
      recallAtK: recallAtK(retrievedIds, q.relevantDocIds, K),
      precisionAtK: precisionAtK(retrievedIds, q.relevantDocIds, K),
      reciprocalRank: reciprocalRank(retrievedIds, q.relevantDocIds),
      ndcgAtK: ndcgAtK(retrievedIds, q.relevantDocIds, K),
      hits: retrievedIds.filter((id) => q.relevantDocIds.includes(id)).length,
    };

    results.push({
      id: q.id,
      query: q.query,
      k: K,
      relevant: q.relevantDocIds,
      retrieved,
      metrics,
    });
  }

  // ── Aggregate ─────────────────────────────────────────────────────────
  const n = results.length;
  const agg = {
    queries: n,
    k: K,
    meanRecallAtK: avg(results.map((r) => r.metrics.recallAtK)),
    meanPrecisionAtK: avg(results.map((r) => r.metrics.precisionAtK)),
    MRR: avg(results.map((r) => r.metrics.reciprocalRank)),
    meanNdcgAtK: avg(results.map((r) => r.metrics.ndcgAtK)),
    hitRate: results.filter((r) => r.metrics.hits > 0).length / n, // % ของ query ที่เจออย่างน้อย 1 relevant
  };

  if (opts.json) {
    console.log(JSON.stringify({ aggregate: agg, results }, null, 2));
  } else {
    printHuman(results, agg);
  }

  await app.close();
}

function avg(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function printHuman(results: QueryResult[], agg: any) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Retrieval Evaluation — k=${agg.k}, n=${agg.queries} queries`);
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // per-query table
  const head = ['ID', 'R@k', 'P@k', 'RR', 'NDCG', 'Hits', 'Query'];
  console.log(
    head[0].padEnd(18) +
    head[1].padEnd(8) +
    head[2].padEnd(8) +
    head[3].padEnd(8) +
    head[4].padEnd(8) +
    head[5].padEnd(6) +
    head[6],
  );
  console.log('─'.repeat(79));
  for (const r of results) {
    const fmt = (x: number) => (x * 100).toFixed(0).padEnd(5) + '%  ';
    const flag = r.metrics.hits === 0 ? '✗' : r.metrics.hits >= r.relevant.length ? '✓' : '~';
    console.log(
      r.id.padEnd(18) +
      fmt(r.metrics.recallAtK) +
      fmt(r.metrics.precisionAtK) +
      fmt(r.metrics.reciprocalRank) +
      fmt(r.metrics.ndcgAtK) +
      (flag + ' ' + r.metrics.hits + '/' + r.relevant.length).padEnd(6) +
      r.query.substring(0, 40),
    );
  }
  console.log('─'.repeat(79));
  console.log('');

  // aggregate
  const pct = (x: number) => (x * 100).toFixed(1) + '%';
  console.log('  Aggregate metrics:');
  console.log(`    Mean Recall@${agg.k}     ${pct(agg.meanRecallAtK)}`);
  console.log(`    Mean Precision@${agg.k}  ${pct(agg.meanPrecisionAtK)}`);
  console.log(`    MRR                 ${pct(agg.MRR)}`);
  console.log(`    Mean NDCG@${agg.k}       ${pct(agg.meanNdcgAtK)}`);
  console.log(`    Hit rate (≥1 rel)   ${pct(agg.hitRate)}`);
  console.log('');

  // failing queries — most useful for debugging
  const zeros = results.filter((r) => r.metrics.hits === 0);
  if (zeros.length > 0) {
    console.log(`  ⚠  ${zeros.length} queries returned no relevant docs in top-${agg.k}:`);
    for (const r of zeros) {
      console.log(`    - [${r.id}] "${r.query}"`);
      console.log(`      expected: [${r.relevant.join(', ')}]  got top-${agg.k}: [${r.retrieved.slice(0, agg.k).map((x) => x.docId).join(', ')}]`);
    }
    console.log('');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
