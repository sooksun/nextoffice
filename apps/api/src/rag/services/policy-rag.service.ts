import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PolicyRagService {
  private readonly logger = new Logger(PolicyRagService.name);

  constructor(private readonly prisma: PrismaService) {}

  async search(query: string, topK = 5): Promise<any[]> {
    const items = await this.prisma.policyItem.findMany({
      where: { effectiveStatus: 'active' },
      include: { clauses: true, document: true },
      take: 100,
    });

    const scored = items
      .map((item) => ({
        item,
        score: this.computeRelevance(
          query,
          `${item.summaryForAction || ''} ${item.document?.title || ''}`,
        ),
      }))
      .filter((x) => x.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map(({ item, score }) => ({
      type: 'policy',
      id: item.id,
      title: item.document?.title || '',
      summary: item.summaryForAction,
      mandatoryLevel: item.mandatoryLevel,
      complianceRiskLevel: item.complianceRiskLevel,
      semanticScore: score,
      trustScore: 0.98,
      freshnessScore: 0.9,
      clauses: item.clauses.map((c) => ({
        id: c.id,
        text: c.clauseText,
        obligationType: c.obligationType,
        actionRequired: c.actionRequired,
      })),
    }));
  }

  private computeRelevance(query: string, text: string): number {
    if (!text) return 0;
    const queryWords = query.toLowerCase().split(/\s+/);
    const textLower = text.toLowerCase();
    const matches = queryWords.filter((w) => w.length > 2 && textLower.includes(w)).length;
    return Math.min(matches / Math.max(queryWords.length, 1), 1);
  }
}
