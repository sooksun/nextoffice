import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService, COLLECTION_KNOWLEDGE, COLLECTION_DOCUMENTS } from './vector-store.service';
import { ThaiTokenizerService } from './thai-tokenizer.service';

export interface HybridResult {
  sourceType: 'policy' | 'horizon' | 'document';
  sourceId: bigint;
  vectorScore: number;   // 0-1 cosine similarity
  keywordScore: number;  // 0-1 TF-IDF relevance
  hybridScore: number;   // 0.6*vector + 0.4*keyword
  snippet: string;
  payload: Record<string, any>;
}

@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);
  private readonly VECTOR_WEIGHT = 0.6;
  private readonly KEYWORD_WEIGHT = 0.4;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    private readonly tokenizer: ThaiTokenizerService,
  ) {}

  async search(query: string, topK = 10): Promise<HybridResult[]> {
    let queryVector: number[] = [];
    try {
      queryVector = await this.embedding.embed(query);
    } catch (err) {
      this.logger.warn(`Vector embedding failed, falling back to keyword-only: ${err.message}`);
    }

    const [knowledgeVec, documentsVec] = queryVector.length
      ? await Promise.all([
          this.vectorStore.search(COLLECTION_KNOWLEDGE, queryVector, 20),
          this.vectorStore.search(COLLECTION_DOCUMENTS, queryVector, 20),
        ])
      : [[], []];

    // Build a map: sourceType+sourceId → vectorScore
    const vectorScoreMap = new Map<string, number>();
    for (const r of knowledgeVec) {
      const key = `${r.payload.sourceType}:${r.payload.sourceId}`;
      vectorScoreMap.set(key, r.score);
    }
    for (const r of documentsVec) {
      const key = `document:${r.payload.documentId}_chunk${r.payload.chunkIndex}`;
      vectorScoreMap.set(key, r.score);
    }

    // Keyword search over policy items
    const policyItems = await this.prisma.policyItem.findMany({
      where: { effectiveStatus: 'active' },
      include: { document: { select: { title: true, summaryText: true } }, clauses: { select: { clauseText: true } } },
      take: 100,
    });

    const policyResults: HybridResult[] = policyItems
      .map((item) => {
        const text = [
          item.document?.title ?? '',
          item.summaryForAction ?? '',
          item.clauses.map((c) => c.clauseText).join(' '),
        ].join(' ');
        const kwScore = this.tokenizer.computeRelevance(query, text);
        const vecScore = vectorScoreMap.get(`policy_clause:${item.id}`) ?? 0;
        const hybrid = this.hybridScore(vecScore, kwScore);
        return {
          sourceType: 'policy' as const,
          sourceId: item.id,
          vectorScore: vecScore,
          keywordScore: kwScore,
          hybridScore: hybrid,
          snippet: (item.summaryForAction ?? item.document?.title ?? '').substring(0, 200),
          payload: { mandatoryLevel: item.mandatoryLevel, complianceRiskLevel: item.complianceRiskLevel },
        };
      })
      .filter((r) => r.hybridScore > 0.03);

    // Keyword search over horizon items
    const horizonItems = await this.prisma.horizonItem.findMany({
      include: {
        document: { select: { title: true, summaryText: true } },
        practices: { select: { practiceTitle: true } },
      },
      take: 100,
    });

    const horizonResults: HybridResult[] = horizonItems
      .map((item) => {
        const text = [
          (item as any).document?.title ?? '',
          item.summary ?? '',
          (item as any).practices?.map((p: any) => p.practiceTitle).join(' ') ?? '',
        ].join(' ');
        const kwScore = this.tokenizer.computeRelevance(query, text);
        const vecScore = vectorScoreMap.get(`horizon_practice:${item.id}`) ?? 0;
        const hybrid = this.hybridScore(vecScore, kwScore);
        return {
          sourceType: 'horizon' as const,
          sourceId: item.id,
          vectorScore: vecScore,
          keywordScore: kwScore,
          hybridScore: hybrid,
          snippet: (item.summary ?? (item as any).document?.title ?? '').substring(0, 200),
          payload: { scope: item.scope, sector: item.sector },
        };
      })
      .filter((r) => r.hybridScore > 0.03);

    // Document chunk results from vector search
    const chunkResults: HybridResult[] = documentsVec
      .filter((r) => r.score > 0.5)
      .map((r) => ({
        sourceType: 'document' as const,
        sourceId: BigInt(r.payload.documentId ?? 0),
        vectorScore: r.score,
        keywordScore: 0,
        hybridScore: r.score * this.VECTOR_WEIGHT,
        snippet: (r.payload.text ?? '').substring(0, 200),
        payload: r.payload,
      }));

    const all = [...policyResults, ...horizonResults, ...chunkResults]
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, topK);

    return all;
  }

  private hybridScore(vectorScore: number, keywordScore: number): number {
    return vectorScore * this.VECTOR_WEIGHT + keywordScore * this.KEYWORD_WEIGHT;
  }
}
