import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDocuments(filters: { sourceType?: string; status?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = filters;
    const where: any = {};
    if (filters.sourceType) where.sourceType = filters.sourceType;
    if (filters.status) where.status = filters.status;

    const [total, items] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { total, page, limit, data: items.map(this.serialize) };
  }

  async findDocumentById(id: number) {
    const doc = await this.prisma.document.findUnique({
      where: { id: BigInt(id) },
      include: { documentTopics: { include: { topic: true } }, documentChunks: { take: 5 } },
    });
    if (!doc) throw new NotFoundException(`Document #${id} not found`);
    return this.serialize(doc);
  }

  private serialize(d: any) {
    return { ...d, id: Number(d.id) };
  }
}
