import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenderService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(t: any) {
    return {
      ...t,
      id: Number(t.id),
      organizationId: Number(t.organizationId),
      authorUserId: Number(t.authorUserId),
      budget: t.budget ? Number(t.budget) : null,
      author: t.author ? { ...t.author, id: Number(t.author.id) } : null,
    };
  }

  async findAll(orgId: bigint, query: { status?: string; tenderType?: string; search?: string }) {
    const where: any = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (query.tenderType) where.tenderType = query.tenderType;
    if (query.search) where.title = { contains: query.search };

    const [total, data] = await Promise.all([
      this.prisma.tenderPost.count({ where }),
      this.prisma.tenderPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { author: { select: { id: true, fullName: true } } },
      }),
    ]);
    return { total, data: data.map(this.serialize) };
  }

  async create(orgId: bigint, userId: bigint, body: {
    title: string;
    content: string;
    budget?: number;
    deadline?: string;
    tenderType?: string;
    fileUrl?: string;
  }) {
    const t = await this.prisma.tenderPost.create({
      data: {
        organizationId: orgId,
        authorUserId: userId,
        title: body.title,
        content: body.content,
        budget: body.budget,
        deadline: body.deadline ? new Date(body.deadline) : null,
        tenderType: body.tenderType ?? 'price_check',
        fileUrl: body.fileUrl,
        status: 'open',
      },
    });
    return this.serialize(t);
  }

  async updateStatus(id: bigint, orgId: bigint, status: string) {
    const t = await this.prisma.tenderPost.findFirst({ where: { id, organizationId: orgId } });
    if (!t) throw new NotFoundException();
    const updated = await this.prisma.tenderPost.update({ where: { id }, data: { status } });
    return this.serialize(updated);
  }
}
