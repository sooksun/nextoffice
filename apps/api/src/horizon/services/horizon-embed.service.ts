import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HorizonEmbedService {
  private readonly logger = new Logger(HorizonEmbedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async embedDocument(documentId: number) {
    const doc = await this.prisma.horizonSourceDocument.findUnique({
      where: { id: BigInt(documentId) },
    });
    if (!doc) throw new NotFoundException(`HorizonSourceDocument #${documentId} not found`);

    const text = doc.normalizedText || doc.rawText;
    const chunks = this.chunkText(text, 500);

    // Delete existing chunks for this document before re-embedding
    await this.prisma.horizonChunk.deleteMany({
      where: { horizonDocumentId: BigInt(documentId) },
    });

    const created = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const record = await this.prisma.horizonChunk.create({
        data: {
          horizonDocumentId: BigInt(documentId),
          chunkIndex: i,
          chunkText: chunk.text,
          sectionLabel: chunk.sectionLabel,
          tokenCount: chunk.estimatedTokens,
        },
      });
      created.push(Number(record.id));
    }

    await this.prisma.horizonSourceDocument.update({
      where: { id: BigInt(documentId) },
      data: { status: 'embedded' },
    });

    this.logger.log(`Created ${created.length} chunks for document #${documentId}`);
    return { documentId, chunkCount: created.length, chunkIds: created };
  }

  chunkText(
    text: string,
    maxTokens = 500,
  ): Array<{ text: string; sectionLabel: string; estimatedTokens: number }> {
    if (!text || !text.trim()) return [];

    // Approximate: 1 Thai character ~ 1.5 tokens, 1 English word ~ 1.3 tokens
    const maxChars = Math.floor(maxTokens * 2);
    const paragraphs = text.split(/\n{2,}/);
    const chunks: Array<{ text: string; sectionLabel: string; estimatedTokens: number }> = [];
    let currentChunk = '';
    let chunkIndex = 0;

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      if (currentChunk.length + trimmed.length + 2 > maxChars && currentChunk) {
        chunks.push({
          text: currentChunk.trim(),
          sectionLabel: chunkIndex === 0 ? 'title' : 'body',
          estimatedTokens: Math.ceil(currentChunk.length / 2),
        });
        currentChunk = '';
        chunkIndex++;
      }

      currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
    }

    if (currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim(),
        sectionLabel: chunkIndex === 0 ? 'title' : 'body',
        estimatedTokens: Math.ceil(currentChunk.length / 2),
      });
    }

    return chunks;
  }
}
