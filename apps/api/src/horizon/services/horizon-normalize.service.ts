import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HorizonNormalizeService {
  private readonly logger = new Logger(HorizonNormalizeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async normalize(documentId: number) {
    const doc = await this.prisma.horizonSourceDocument.findUnique({
      where: { id: BigInt(documentId) },
    });
    if (!doc) throw new NotFoundException(`HorizonSourceDocument #${documentId} not found`);

    const normalizedText = this.cleanText(doc.rawText);

    await this.prisma.horizonSourceDocument.update({
      where: { id: BigInt(documentId) },
      data: {
        normalizedText,
        status: 'normalized',
      },
    });

    this.logger.log(`Normalized document #${documentId} (${normalizedText.length} chars)`);
    return { documentId, status: 'normalized', charCount: normalizedText.length };
  }

  async isDuplicate(contentHash: string, sourceId: number): Promise<boolean> {
    const existing = await this.prisma.horizonSourceDocument.findFirst({
      where: {
        sourceId: BigInt(sourceId),
        contentHash,
      },
    });
    return !!existing;
  }

  private cleanText(raw: string): string {
    let text = raw;

    // Remove HTML tags
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
    text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
    text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#\d+;/g, '');

    // Normalize whitespace
    text = text.replace(/[\t\r]+/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/ {2,}/g, ' ');
    text = text.split('\n').map((line) => line.trim()).join('\n');
    text = text.trim();

    return text;
  }
}
