import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class HorizonFetchService {
  private readonly logger = new Logger(HorizonFetchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async fetchSource(sourceId: number) {
    const source = await this.prisma.horizonSource.findUnique({
      where: { id: BigInt(sourceId) },
    });
    if (!source) throw new NotFoundException(`HorizonSource #${sourceId} not found`);

    this.logger.log(`Fetching from source: ${source.sourceName} (${source.baseUrl})`);

    try {
      const response = await axios.get(source.baseUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'NextOffice-HorizonBot/1.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        responseType: 'text',
      });

      const rawText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const contentHash = crypto.createHash('sha256').update(rawText).digest('hex');

      const existing = await this.prisma.horizonSourceDocument.findFirst({
        where: { sourceId: BigInt(sourceId), contentHash },
      });
      if (existing) {
        this.logger.log(`Duplicate content detected for source ${source.sourceCode}, skipping`);
        return { status: 'duplicate', documentId: Number(existing.id) };
      }

      const doc = await this.prisma.horizonSourceDocument.create({
        data: {
          sourceId: BigInt(sourceId),
          title: this.extractTitle(rawText) || source.sourceName,
          url: source.baseUrl,
          contentType: 'news',
          rawText,
          contentHash,
          status: 'fetched',
        },
      });

      await this.prisma.horizonSource.update({
        where: { id: BigInt(sourceId) },
        data: { lastFetchAt: new Date() },
      });

      this.logger.log(`Fetched document #${doc.id} from ${source.sourceCode}`);
      return { status: 'fetched', documentId: Number(doc.id) };
    } catch (error) {
      this.logger.error(`Failed to fetch source ${source.sourceCode}: ${error.message}`);
      throw error;
    }
  }

  async fetchAllActive() {
    const sources = await this.prisma.horizonSource.findMany({
      where: { isActive: true },
    });

    this.logger.log(`Fetching from ${sources.length} active sources`);
    const results = [];

    for (const source of sources) {
      try {
        const result = await this.fetchSource(Number(source.id));
        results.push({ sourceId: Number(source.id), sourceCode: source.sourceCode, ...result });
      } catch (error) {
        results.push({
          sourceId: Number(source.id),
          sourceCode: source.sourceCode,
          status: 'error',
          error: error.message,
        });
      }
    }

    return results;
  }

  private extractTitle(html: string): string | null {
    const match = html.match(/<title[^>]*>(.*?)<\/title>/is);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, ' ').trim().substring(0, 500);
    }
    return null;
  }
}
