import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { HorizonRagService } from './horizon-rag.service';
import { PolicyRagService } from './policy-rag.service';
import { HybridSearchService, HybridResult } from './hybrid-search.service';
import { RerankerService } from './reranker.service';

export interface RetrievalResult {
  sourceType: 'horizon' | 'horizon_v2' | 'policy' | 'context' | 'user_knowledge';
  sourceRecordId: bigint;
  semanticScore: number;
  trustScore: number;
  freshnessScore: number;
  contextFitScore: number;
  finalScore: number;
  rationale: string;
  data: any;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  // Hybrid candidate pool to rerank down to FINAL_TOP_K.
  // Larger pool = better recall, but more snippet tokens sent to the LLM reranker.
  private readonly HYBRID_POOL_SIZE = 20;
  private readonly FINAL_TOP_K = 8;
  private readonly RERANK_MIN_SCORE = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly horizonRag: HorizonRagService,
    private readonly policyRag: PolicyRagService,
    @Optional() private readonly hybridSearch: HybridSearchService,
    @Optional() private readonly reranker: RerankerService,
  ) {}

  async retrieve(caseId: bigint, query: string, orgId: bigint): Promise<RetrievalResult[]> {
    // If HybridSearchService is available, use it; otherwise fall back to keyword-only
    if (this.hybridSearch) {
      return this.retrieveHybrid(caseId, query, orgId);
    }

    const searchPromises: Promise<any>[] = [
      this.horizonRag.search(query),
      this.policyRag.search(query),
    ];

    const enableV2 = this.configService.get('ENABLE_HORIZON_V2', 'false') === 'true';
    if (enableV2) {
      const keywords = query.split(/\s+/).filter((k) => k.length > 1);
      searchPromises.push(this.horizonRag.searchHorizonV2(keywords));
    }

    const [horizonResults, policyResults, horizonV2Results = []] = await Promise.all(searchPromises);

    const contextFitScore = await this.computeContextFit(orgId);

    const allResults: RetrievalResult[] = [];

    for (const h of horizonResults) {
      const final = this.computeFinalScore(h.semanticScore, h.trustScore, h.freshnessScore, contextFitScore);
      allResults.push({
        sourceType: 'horizon',
        sourceRecordId: h.id,
        semanticScore: h.semanticScore,
        trustScore: h.trustScore,
        freshnessScore: h.freshnessScore,
        contextFitScore,
        finalScore: final,
        rationale: `Horizon: ${h.summary?.substring(0, 100) || ''}`,
        data: h,
      });
    }

    for (const v2 of horizonV2Results) {
      const final = this.computeFinalScore(v2.semanticScore, v2.trustScore, v2.freshnessScore, contextFitScore);
      allResults.push({
        sourceType: 'horizon_v2',
        sourceRecordId: v2.id,
        semanticScore: v2.semanticScore,
        trustScore: v2.trustScore,
        freshnessScore: v2.freshnessScore,
        contextFitScore,
        finalScore: final,
        rationale: `Horizon V2: ${v2.summary?.substring(0, 100) || ''}`,
        data: v2,
      });
    }

    for (const p of policyResults) {
      const final = this.computeFinalScore(p.semanticScore, p.trustScore, p.freshnessScore, 0.9);
      allResults.push({
        sourceType: 'policy',
        sourceRecordId: p.id,
        semanticScore: p.semanticScore,
        trustScore: p.trustScore,
        freshnessScore: p.freshnessScore,
        contextFitScore: 0.9,
        finalScore: final,
        rationale: `Policy: ${p.summary?.substring(0, 100) || ''}`,
        data: p,
      });
    }

    // Sort by finalScore and save retrieval results
    const sorted = allResults.sort((a, b) => b.finalScore - a.finalScore);

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      await this.prisma.caseRetrievalResult.create({
        data: {
          inboundCaseId: caseId,
          sourceType: r.sourceType,
          sourceRecordId: r.sourceRecordId,
          retrievalRank: i + 1,
          semanticScore: r.semanticScore,
          trustScore: r.trustScore,
          freshnessScore: r.freshnessScore,
          contextFitScore: r.contextFitScore,
          finalScore: r.finalScore,
          rationale: r.rationale,
        },
      });
    }

    return sorted;
  }

  private async retrieveHybrid(caseId: bigint, query: string, orgId: bigint): Promise<RetrievalResult[]> {
    // 1. Retrieve a big candidate pool
    const hybridResults = await this.hybridSearch.search(query, this.HYBRID_POOL_SIZE);
    const contextFitScore = await this.computeContextFit(orgId);

    // 2. LLM rerank down to FINAL_TOP_K (graceful degradation if service unavailable)
    const ranked = await this.rerankCandidates(query, hybridResults);

    // 3. Blend rerank score with context fit → finalScore in [0, 1]
    const allResults: RetrievalResult[] = ranked.map(({ result: h, rerankScore }) => {
      // rerankScore is 0–10; normalize to 0–1
      const rerankNorm = Math.max(0, Math.min(1, rerankScore / 10));
      // 60% LLM relevance judgment + 25% hybrid baseline + 15% org context
      const final = rerankNorm * 0.6 + h.hybridScore * 0.25 + contextFitScore * 0.15;

      const mappedType: RetrievalResult['sourceType'] =
        h.sourceType === 'document' ? 'context' : h.sourceType;
      return {
        sourceType: mappedType,
        sourceRecordId: h.sourceId,
        semanticScore: h.vectorScore,
        trustScore: 0.8,
        freshnessScore: 0.7,
        contextFitScore,
        finalScore: Math.min(final, 1),
        rationale: `${h.sourceType} [rerank:${rerankScore.toFixed(1)}]: ${h.snippet}`,
        data: h.payload,
      };
    });

    const sorted = allResults.sort((a, b) => b.finalScore - a.finalScore);

    // 4. Persist ranked results (sequential — retains insertion order for audit trail)
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      await this.prisma.caseRetrievalResult.create({
        data: {
          inboundCaseId: caseId,
          sourceType: r.sourceType,
          sourceRecordId: r.sourceRecordId,
          retrievalRank: i + 1,
          semanticScore: r.semanticScore,
          trustScore: r.trustScore,
          freshnessScore: r.freshnessScore,
          contextFitScore: r.contextFitScore,
          finalScore: r.finalScore,
          rationale: r.rationale,
        },
      });
    }
    return sorted;
  }

  /**
   * Adapter: HybridResult[] → RerankCandidate[] → LLM score → join back.
   * Returns FINAL_TOP_K items with rerank scores attached.
   *
   * Falls back to first-K-with-neutral-score when the reranker is
   * unavailable (no GEMINI key, DI token unbound, or LLM timeout).
   */
  private async rerankCandidates(
    query: string,
    hybrid: HybridResult[],
  ): Promise<Array<{ result: HybridResult; rerankScore: number }>> {
    if (hybrid.length === 0) return [];

    // No reranker available → keep existing hybrid order with neutral score
    if (!this.reranker) {
      return hybrid.slice(0, this.FINAL_TOP_K).map((r) => ({ result: r, rerankScore: 5 }));
    }

    // Index-as-id keeps the mapping back to HybridResult trivial and safe
    // against duplicate (sourceType, sourceId) pairs in the pool.
    const candidates = hybrid.map((h, i) => ({
      id: String(i),
      text: h.snippet,
    }));

    const ranked = await this.reranker.rerank(query, candidates, this.FINAL_TOP_K, {
      minScore: this.RERANK_MIN_SCORE,
    });

    if (ranked.length === 0) {
      this.logger.debug('Reranker dropped all candidates — falling back to hybrid top-K');
      return hybrid.slice(0, this.FINAL_TOP_K).map((r) => ({ result: r, rerankScore: 5 }));
    }

    return ranked
      .map((r) => {
        const idx = Number(r.candidate.id);
        const hr = hybrid[idx];
        return hr ? { result: hr, rerankScore: r.rerankScore } : null;
      })
      .filter((x): x is { result: HybridResult; rerankScore: number } => x !== null);
  }

  private computeFinalScore(semantic: number, trust: number, freshness: number, contextFit: number): number {
    return semantic * 0.4 + trust * 0.25 + freshness * 0.15 + contextFit * 0.2;
  }

  private async computeContextFit(orgId: bigint): Promise<number> {
    const scores = await this.prisma.organizationContextScore.findMany({
      where: { organizationId: orgId },
    });
    if (!scores.length) return 0.5;
    const avg = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    return Math.min(avg / 5, 1); // normalize to 0-1
  }
}
