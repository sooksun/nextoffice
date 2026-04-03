import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class HorizonRagService {
  private readonly logger = new Logger(HorizonRagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async search(query: string, topK = 5): Promise<any[]> {
    // Semantic search using keyword matching for now
    // In production: use pgvector or Qdrant
    const items = await this.prisma.horizonItem.findMany({
      include: { practices: true, document: true },
      take: 100,
    });

    const scored = items
      .map((item) => ({
        item,
        score: this.computeRelevance(query, `${item.summary || ''} ${item.document?.title || ''}`),
      }))
      .filter((x) => x.score > 0.1)
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
      trustScore: item.evidenceStrength === 'high' ? 0.95 : 0.75,
      freshnessScore: 0.8,
      practices: item.practices,
    }));
  }

  private computeRelevance(query: string, text: string): number {
    if (!text) return 0;
    const queryWords = query.toLowerCase().split(/\s+/);
    const textLower = text.toLowerCase();
    const matches = queryWords.filter((w) => w.length > 2 && textLower.includes(w)).length;
    return Math.min(matches / queryWords.length, 1);
  }
}
