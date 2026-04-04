import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ThaiTokenizerService } from './thai-tokenizer.service';

@Injectable()
export class HorizonRagService {
  private readonly logger = new Logger(HorizonRagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizer: ThaiTokenizerService,
  ) {}

  async search(query: string, topK = 5): Promise<any[]> {
    const items = await this.prisma.horizonItem.findMany({
      include: { practices: true, document: true },
      take: 100,
    });

    const scored = items
      .map((item) => {
        const searchText = [
          item.summary || '',
          item.document?.title || '',
          item.document?.summaryText || '',
          item.practices.map((p) => `${p.practiceTitle} ${p.problemAddressed || ''}`).join(' '),
        ].join(' ');

        return {
          item,
          score: this.tokenizer.computeRelevance(query, searchText),
        };
      })
      .filter((x) => x.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map(({ item, score }) => ({
      type: 'horizon',
      id: item.id,
      title: item.document?.title || '',
      summary: item.summary,
      evidenceStrength: item.evidenceStrength,
      budgetRequirement: item.budgetRequirement,
      semanticScore: score,
      trustScore: this.computeTrustScore(item),
      freshnessScore: this.computeFreshnessScore(item.document),
      practices: item.practices,
    }));
  }

  private computeTrustScore(item: any): number {
    const base = { high: 0.95, medium: 0.8, low: 0.6 };
    return base[item.evidenceStrength as keyof typeof base] ?? 0.7;
  }

  private computeFreshnessScore(doc: any): number {
    if (!doc?.publishedAt) return 0.7;
    const ageYears =
      (Date.now() - new Date(doc.publishedAt).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears <= 1) return 0.95;
    if (ageYears <= 3) return 0.85;
    if (ageYears <= 5) return 0.75;
    return 0.6;
  }
}
