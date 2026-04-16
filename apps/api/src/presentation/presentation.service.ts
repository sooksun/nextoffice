import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PresentationService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(f: any) {
    return {
      ...f,
      id: Number(f.id),
      organizationId: Number(f.organizationId),
      senderUserId: Number(f.senderUserId),
      receiverUserId: f.receiverUserId ? Number(f.receiverUserId) : null,
      sender: f.sender ? { ...f.sender, id: Number(f.sender.id) } : null,
      receiver: f.receiver ? { ...f.receiver, id: Number(f.receiver.id) } : null,
    };
  }

  async findAll(orgId: bigint, query: { status?: string; mode?: string; userId?: bigint }) {
    const { status, mode, userId } = query;
    const where: any = { organizationId: orgId };
    if (status) where.status = status;
    if (mode === 'sent' && userId) where.senderUserId = userId;
    if (mode === 'received' && userId) where.receiverUserId = userId;

    const [total, data] = await Promise.all([
      this.prisma.presentationFile.count({ where }),
      this.prisma.presentationFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          sender: { select: { id: true, fullName: true } },
          receiver: { select: { id: true, fullName: true } },
        },
      }),
    ]);
    return { total, data: data.map(this.serialize) };
  }

  async findOne(id: bigint, orgId: bigint) {
    const f = await this.prisma.presentationFile.findFirst({
      where: { id, organizationId: orgId },
      include: {
        sender: { select: { id: true, fullName: true } },
        receiver: { select: { id: true, fullName: true } },
      },
    });
    if (!f) throw new NotFoundException(`PresentationFile #${id} not found`);
    return this.serialize(f);
  }

  async create(orgId: bigint, userId: bigint, body: {
    title: string;
    description?: string;
    fileUrl?: string;
    receiverUserId?: number;
  }) {
    const f = await this.prisma.presentationFile.create({
      data: {
        organizationId: orgId,
        senderUserId: userId,
        receiverUserId: body.receiverUserId ? BigInt(body.receiverUserId) : null,
        title: body.title,
        description: body.description,
        fileUrl: body.fileUrl,
        status: 'pending',
      },
    });
    return { ...f, id: Number(f.id) };
  }

  async updateStatus(id: bigint, orgId: bigint, status: string, note?: string) {
    await this.findOne(id, orgId);
    const f = await this.prisma.presentationFile.update({
      where: { id },
      data: { status, directorNote: note, reviewedAt: new Date() },
    });
    return { ...f, id: Number(f.id) };
  }
}
