import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HorizonRagService } from './horizon-rag.service';
import { PolicyRagService } from './policy-rag.service';

export interface RetrievalResult {
  sourceType: 'horizon' | 'policy' | 'context';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly horizonRag: HorizonRagService,
    private readonly policyRag: PolicyRagService,
  ) {}

  async retrieve(caseId: bigint, query: string, orgId: bigint): Promise<RetrievalResult[]> {
    const [horizonResults, policyResults] = await Promise.all([
      this.horizonRag.search(query),
      this.policyRag.search(query),
    ]);

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
