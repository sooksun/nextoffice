import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CircularService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: bigint, query: { search?: string; status?: string; take?: number }) {
    const { search, status, take = 50 } = query;
    const where: any = { organizationId: orgId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { circularNo: { contains: search } },
      ];
    }
    const [total, data] = await Promise.all([
      this.prisma.circularDocument.count({ where }),
      this.prisma.circularDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          createdBy: { select: { id: true, fullName: true } },
          circularRecipients: true,
        },
      }),
    ]);
    return {
      total,
      data: data.map((d) => ({
        ...d,
        id: Number(d.id),
        organizationId: Number(d.organizationId),
        createdByUserId: Number(d.createdByUserId),
        createdBy: d.createdBy ? { ...d.createdBy, id: Number(d.createdBy.id) } : null,
        circularRecipients: d.circularRecipients.map((r) => ({
          ...r,
          id: Number(r.id),
          circularDocumentId: Number(r.circularDocumentId),
        })),
      })),
    };
  }

  async findOne(id: bigint, orgId: bigint) {
    const doc = await this.prisma.circularDocument.findFirst({
      where: { id, organizationId: orgId },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        circularRecipients: true,
      },
    });
    if (!doc) throw new NotFoundException(`CircularDocument #${id} not found`);
    return {
      ...doc,
      id: Number(doc.id),
      organizationId: Number(doc.organizationId),
      createdByUserId: Number(doc.createdByUserId),
      createdBy: doc.createdBy ? { ...doc.createdBy, id: Number(doc.createdBy.id) } : null,
      circularRecipients: doc.circularRecipients.map((r) => ({
        ...r,
        id: Number(r.id),
        circularDocumentId: Number(r.circularDocumentId),
      })),
    };
  }

  async create(orgId: bigint, userId: bigint, body: {
    circularNo: string;
    subject: string;
    body?: string;
    urgencyLevel?: string;
    issuedDate: string;
    fileUrl?: string;
    recipients?: string[];
  }) {
    const doc = await this.prisma.circularDocument.create({
      data: {
        organizationId: orgId,
        createdByUserId: userId,
        circularNo: body.circularNo,
        subject: body.subject,
        body: body.body,
        urgencyLevel: body.urgencyLevel ?? 'normal',
        issuedDate: new Date(body.issuedDate),
        fileUrl: body.fileUrl,
        status: 'published',
        circularRecipients: body.recipients?.length
          ? { create: body.recipients.map((name) => ({ recipientName: name })) }
          : undefined,
      },
      include: { circularRecipients: true },
    });
    return { ...doc, id: Number(doc.id), organizationId: Number(doc.organizationId) };
  }

  async updateStatus(id: bigint, orgId: bigint, status: string) {
    await this.findOne(id, orgId);
    const doc = await this.prisma.circularDocument.update({
      where: { id },
      data: { status },
    });
    return { ...doc, id: Number(doc.id) };
  }
}
