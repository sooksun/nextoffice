import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ThaiTokenizerService } from './thai-tokenizer.service';

@Injectable()
export class PolicyRagService {
  private readonly logger = new Logger(PolicyRagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizer: ThaiTokenizerService,
  ) {}

  async search(query: string, topK = 5): Promise<any[]> {
    const items = await this.prisma.policyItem.findMany({
      where: { effectiveStatus: 'active' },
      include: { clauses: true, document: true },
      take: 100,
    });

    const scored = items
      .map((item) => {
        // รวม text จากหลายแหล่งเพื่อให้ search ได้ครอบคลุมขึ้น
        const searchText = [
          item.summaryForAction || '',
          item.document?.title || '',
          item.document?.summaryText || '',
          item.clauses.map((c) => c.clauseText).join(' '),
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
      type: 'policy',
      id: item.id,
      title: item.document?.title || '',
      summary: item.summaryForAction,
      mandatoryLevel: item.mandatoryLevel,
      complianceRiskLevel: item.complianceRiskLevel,
      semanticScore: score,
      trustScore: this.computeTrustScore(item),
      freshnessScore: this.computeFreshnessScore(item.document),
      clauses: item.clauses.map((c) => ({
        id: c.id,
        text: c.clauseText,
        obligationType: c.obligationType,
        actionRequired: c.actionRequired,
      })),
    }));
  }

  /** คำนวณ trust จาก mandatoryLevel + jurisdictionLevel */
  private computeTrustScore(item: any): number {
    let score = 0.7; // baseline
    if (item.mandatoryLevel === 'mandatory') score += 0.2;
    else if (item.mandatoryLevel === 'recommended') score += 0.1;
    if (item.jurisdictionLevel === 'national') score += 0.1;
    else if (item.jurisdictionLevel === 'regional') score += 0.05;
    return Math.min(score, 1);
  }

  /** คำนวณ freshness จาก publishedAt ของ document */
  private computeFreshnessScore(doc: any): number {
    if (!doc?.publishedAt) return 0.7; // default ถ้าไม่มีวันที่
    const ageYears =
      (Date.now() - new Date(doc.publishedAt).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears <= 1) return 0.95;
    if (ageYears <= 2) return 0.9;
    if (ageYears <= 5) return 0.8;
    if (ageYears <= 10) return 0.65;
    return 0.5; // เอกสารเก่ามาก แต่ยังมีค่า (ระเบียบสารบรรณ 2526 ยังใช้อยู่)
  }
}
