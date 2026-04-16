import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(m: any) {
    return {
      ...m,
      id: Number(m.id),
      organizationId: Number(m.organizationId),
      senderUserId: Number(m.senderUserId),
      receiverUserId: Number(m.receiverUserId),
      parentMessageId: m.parentMessageId ? Number(m.parentMessageId) : null,
      sender: m.sender ? { ...m.sender, id: Number(m.sender.id) } : null,
      receiver: m.receiver ? { ...m.receiver, id: Number(m.receiver.id) } : null,
    };
  }

  async findInbox(orgId: bigint, userId: bigint) {
    const data = await this.prisma.privateMessage.findMany({
      where: { organizationId: orgId, receiverUserId: userId, parentMessageId: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        sender: { select: { id: true, fullName: true } },
        receiver: { select: { id: true, fullName: true } },
      },
    });
    return { total: data.length, data: data.map(this.serialize) };
  }

  async findSent(orgId: bigint, userId: bigint) {
    const data = await this.prisma.privateMessage.findMany({
      where: { organizationId: orgId, senderUserId: userId, parentMessageId: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        sender: { select: { id: true, fullName: true } },
        receiver: { select: { id: true, fullName: true } },
      },
    });
    return { total: data.length, data: data.map(this.serialize) };
  }

  async send(orgId: bigint, senderId: bigint, body: {
    receiverUserId: number;
    subject?: string;
    content: string;
    parentMessageId?: number;
  }) {
    const m = await this.prisma.privateMessage.create({
      data: {
        organizationId: orgId,
        senderUserId: senderId,
        receiverUserId: BigInt(body.receiverUserId),
        subject: body.subject,
        content: body.content,
        parentMessageId: body.parentMessageId ? BigInt(body.parentMessageId) : null,
      },
    });
    return this.serialize(m);
  }

  async markRead(id: bigint, userId: bigint) {
    await this.prisma.privateMessage.updateMany({
      where: { id, receiverUserId: userId },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }

  async getUnreadCount(orgId: bigint, userId: bigint) {
    const count = await this.prisma.privateMessage.count({
      where: { organizationId: orgId, receiverUserId: userId, isRead: false },
    });
    return { count };
  }
}
