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

  /**
   * Search HorizonSourceDocument (Phase 2 V2 data) by keyword matching
   * against title, rawText, summaryText, and linked agenda topicTags.
   */
  async searchHorizonV2(keywords: string[], options?: { topK?: number }): Promise<any[]> {
    const topK = options?.topK ?? 5;

    // Guard: skip if no V2 data exists
    const count = await this.prisma.horizonSourceDocument.count();
    if (count === 0) return [];

    const docs = await this.prisma.horizonSourceDocument.findMany({
      where: { status: { not: 'fetched' } },
      include: {
        source: true,
        agendas: { include: { agenda: true } },
        signals: true,
      },
      take: 200,
    });

    const query = keywords.join(' ');

    const scored = docs
      .map((doc) => {
        const agendaTags = doc.agendas
          .map((da) => {
            const tags = da.agenda.topicTags ? String(da.agenda.topicTags) : '';
            return `${da.agenda.agendaTitle} ${da.agenda.summaryText || ''} ${tags}`;
          })
          .join(' ');

        const signalText = doc.signals
          .map((s) => `${s.signalTitle} ${s.signalText}`)
          .join(' ');

        const searchText = [
          doc.title,
          doc.summaryText || '',
          doc.normalizedText || '',
          agendaTags,
          signalText,
        ].join(' ');

        const semanticScore = this.tokenizer.computeRelevance(query, searchText);

        return { doc, semanticScore };
      })
      .filter((x) => x.semanticScore > 0.05)
      .sort((a, b) => b.semanticScore - a.semanticScore)
      .slice(0, topK);

    return scored.map(({ doc, semanticScore }) => ({
      type: 'horizon_v2',
      id: doc.id,
      title: doc.title,
      summary: doc.summaryText,
      contentType: doc.contentType,
      semanticScore,
      trustScore: this.computeV2TrustScore(doc),
      freshnessScore: this.computeFreshnessScore(doc),
      signals: doc.signals,
      agendas: doc.agendas.map((da) => ({
        agendaTitle: da.agenda.agendaTitle,
        relationType: da.relationType,
        confidenceScore: Number(da.confidenceScore),
      })),
    }));
  }

  private computeV2TrustScore(doc: any): number {
    const quality = doc.qualityScore ? Number(doc.qualityScore) : 0.7;
    // Boost trust for docs with signals (they have been analyzed)
    const signalBoost = doc.signals?.length > 0 ? 0.05 : 0;
    return Math.min(quality + signalBoost, 1);
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
