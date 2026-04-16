import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebboardService {
  constructor(private readonly prisma: PrismaService) {}

  private serializeThread(t: any) {
    return {
      ...t,
      id: Number(t.id),
      organizationId: Number(t.organizationId),
      authorUserId: Number(t.authorUserId),
      author: t.author ? { ...t.author, id: Number(t.author.id) } : null,
    };
  }

  private serializeReply(r: any) {
    return {
      ...r,
      id: Number(r.id),
      threadId: Number(r.threadId),
      authorUserId: Number(r.authorUserId),
      author: r.author ? { ...r.author, id: Number(r.author.id) } : null,
    };
  }

  async findAllThreads(orgId: bigint, query: { category?: string; search?: string }) {
    const where: any = { organizationId: orgId };
    if (query.category) where.category = query.category;
    if (query.search) where.title = { contains: query.search };

    const [total, data] = await Promise.all([
      this.prisma.webboardThread.count({ where }),
      this.prisma.webboardThread.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { lastReplyAt: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        include: { author: { select: { id: true, fullName: true } } },
      }),
    ]);
    return { total, data: data.map(this.serializeThread) };
  }

  async findThread(id: bigint, orgId: bigint) {
    const t = await this.prisma.webboardThread.findFirst({
      where: { id, organizationId: orgId },
      include: {
        author: { select: { id: true, fullName: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!t) throw new NotFoundException(`Thread #${id} not found`);
    await this.prisma.webboardThread.update({ where: { id }, data: { viewCount: { increment: 1 } } });
    return {
      ...this.serializeThread(t),
      replies: t.replies.map(this.serializeReply),
    };
  }

  async createThread(orgId: bigint, userId: bigint, body: {
    title: string;
    content: string;
    category?: string;
  }) {
    const t = await this.prisma.webboardThread.create({
      data: {
        organizationId: orgId,
        authorUserId: userId,
        title: body.title,
        content: body.content,
        category: body.category ?? 'general',
      },
    });
    return this.serializeThread(t);
  }

  async createReply(threadId: bigint, orgId: bigint, userId: bigint, content: string) {
    const thread = await this.prisma.webboardThread.findFirst({ where: { id: threadId, organizationId: orgId } });
    if (!thread) throw new NotFoundException();
    const r = await this.prisma.webboardReply.create({
      data: { threadId, authorUserId: userId, content },
    });
    await this.prisma.webboardThread.update({
      where: { id: threadId },
      data: { replyCount: { increment: 1 }, lastReplyAt: new Date() },
    });
    return this.serializeReply(r);
  }
}
