import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(p: any) {
    return {
      ...p,
      id: Number(p.id),
      organizationId: Number(p.organizationId),
      authorUserId: Number(p.authorUserId),
      author: p.author ? { ...p.author, id: Number(p.author.id) } : null,
    };
  }

  async findAll(orgId: bigint, query: { status?: string; search?: string }) {
    const where: any = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (query.search) where.title = { contains: query.search };

    const [total, data] = await Promise.all([
      this.prisma.newsPost.count({ where }),
      this.prisma.newsPost.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        include: { author: { select: { id: true, fullName: true } } },
      }),
    ]);
    return { total, data: data.map(this.serialize) };
  }

  async findOne(id: bigint, orgId: bigint) {
    const p = await this.prisma.newsPost.findFirst({
      where: { id, organizationId: orgId },
      include: { author: { select: { id: true, fullName: true } } },
    });
    if (!p) throw new NotFoundException(`NewsPost #${id} not found`);
    await this.prisma.newsPost.update({ where: { id }, data: { viewCount: { increment: 1 } } });
    return this.serialize(p);
  }

  async create(orgId: bigint, userId: bigint, body: {
    title: string;
    content: string;
    imageUrl?: string;
    isPinned?: boolean;
    publishedAt?: string;
  }) {
    const p = await this.prisma.newsPost.create({
      data: {
        organizationId: orgId,
        authorUserId: userId,
        title: body.title,
        content: body.content,
        imageUrl: body.imageUrl,
        isPinned: body.isPinned ?? false,
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date(),
        status: 'published',
      },
    });
    return this.serialize(p);
  }

  async update(id: bigint, orgId: bigint, body: Partial<{ title: string; content: string; status: string; isPinned: boolean }>) {
    await this.prisma.newsPost.findFirst({ where: { id, organizationId: orgId } })
      .then((p) => { if (!p) throw new NotFoundException(); });
    const p = await this.prisma.newsPost.update({ where: { id }, data: body });
    return this.serialize(p);
  }

  async delete(id: bigint, orgId: bigint) {
    const p = await this.prisma.newsPost.findFirst({ where: { id, organizationId: orgId } });
    if (!p) throw new NotFoundException();
    await this.prisma.newsPost.delete({ where: { id } });
    return { success: true };
  }
}
