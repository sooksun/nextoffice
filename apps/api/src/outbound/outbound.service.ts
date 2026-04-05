import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutboundService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: number, status?: string) {
    const where: any = { organizationId: BigInt(organizationId) };
    if (status) where.status = status;

    const docs = await this.prisma.outboundDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        relatedInboundCase: { select: { id: true, title: true, registrationNo: true } },
      },
    });
    return docs.map((d) => this.serialize(d));
  }

  async findOne(id: number) {
    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(id) },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        relatedInboundCase: { select: { id: true, title: true, registrationNo: true } },
        documentRegistries: { orderBy: { createdAt: 'desc' } },
      },
    });
    return doc ? this.serialize(doc) : null;
  }

  async create(dto: {
    organizationId: number;
    createdByUserId?: number;
    subject: string;
    bodyText?: string;
    recipientName?: string;
    recipientOrg?: string;
    recipientEmail?: string;
    urgencyLevel?: string;
    securityLevel?: string;
    relatedInboundCaseId?: number;
    sentMethod?: string;
  }) {
    const doc = await this.prisma.outboundDocument.create({
      data: {
        organizationId: BigInt(dto.organizationId),
        createdByUserId: dto.createdByUserId ? BigInt(dto.createdByUserId) : undefined,
        subject: dto.subject,
        bodyText: dto.bodyText,
        recipientName: dto.recipientName,
        recipientOrg: dto.recipientOrg,
        recipientEmail: dto.recipientEmail,
        urgencyLevel: dto.urgencyLevel ?? 'normal',
        securityLevel: dto.securityLevel ?? 'normal',
        relatedInboundCaseId: dto.relatedInboundCaseId ? BigInt(dto.relatedInboundCaseId) : undefined,
        sentMethod: dto.sentMethod,
        status: 'draft',
      },
    });
    return { id: Number(doc.id) };
  }

  async approve(id: number, approvedByUserId: number) {
    // Generate document number: <orgCode>/<sequence>/<buddhistYear>
    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(id) },
      include: { organization: { select: { orgCode: true } } },
    });
    if (!doc) return null;

    const documentNo = await this.generateDocumentNo(doc.organizationId, doc.organization?.orgCode);
    const updated = await this.prisma.outboundDocument.update({
      where: { id: BigInt(id) },
      data: {
        status: 'approved',
        documentNo,
        approvedByUserId: BigInt(approvedByUserId),
        approvedAt: new Date(),
        documentDate: new Date(),
      },
    });
    return { id: Number(updated.id), documentNo };
  }

  async send(id: number) {
    const updated = await this.prisma.outboundDocument.update({
      where: { id: BigInt(id) },
      data: { status: 'sent', sentAt: new Date() },
    });

    // Auto-create a DocumentRegistry entry
    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(id) },
      include: { organization: { select: { orgCode: true, name: true } } },
    });
    if (doc) {
      const currentYear = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
      });
      const regCount = await this.prisma.documentRegistry.count({
        where: { organizationId: doc.organizationId, registryType: 'outbound' },
      });
      await this.prisma.documentRegistry.create({
        data: {
          organizationId: doc.organizationId,
          registryType: 'outbound',
          registryNo: String(regCount + 1).padStart(4, '0'),
          documentNo: doc.documentNo,
          documentDate: doc.documentDate,
          fromOrg: doc.organization?.name,
          toOrg: doc.recipientOrg,
          subject: doc.subject,
          urgencyLevel: doc.urgencyLevel,
          outboundDocId: doc.id,
          academicYearId: currentYear?.id ?? undefined,
        },
      });
    }

    return { id: Number(updated.id), status: 'sent' };
  }

  async getRegistry(organizationId: number, registryType?: string, academicYearId?: number) {
    const where: any = { organizationId: BigInt(organizationId) };
    if (registryType) where.registryType = registryType;
    if (academicYearId) where.academicYearId = BigInt(academicYearId);

    const entries = await this.prisma.documentRegistry.findMany({
      where,
      orderBy: [{ registryType: 'asc' }, { createdAt: 'desc' }],
      include: {
        inboundCase: { select: { id: true, title: true } },
        outboundDoc: { select: { id: true, subject: true } },
        academicYear: { select: { year: true, name: true } },
      },
    });
    return entries.map((e) => ({
      ...e,
      id: Number(e.id),
      organizationId: Number(e.organizationId),
      inboundCaseId: e.inboundCaseId ? Number(e.inboundCaseId) : null,
      outboundDocId: e.outboundDocId ? Number(e.outboundDocId) : null,
      academicYearId: e.academicYearId ? Number(e.academicYearId) : null,
      inboundCase: e.inboundCase ? { ...e.inboundCase, id: Number(e.inboundCase.id) } : null,
      outboundDoc: e.outboundDoc ? { ...e.outboundDoc, id: Number(e.outboundDoc.id) } : null,
    }));
  }

  /** Register an inbound case into the document registry */
  async registerInbound(inboundCaseId: number) {
    const cas = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(inboundCaseId) },
      include: { academicYear: true },
    });
    if (!cas) return null;

    const regCount = await this.prisma.documentRegistry.count({
      where: { organizationId: cas.organizationId, registryType: 'inbound' },
    });
    const entry = await this.prisma.documentRegistry.create({
      data: {
        organizationId: cas.organizationId,
        registryType: 'inbound',
        registryNo: cas.registrationNo ?? String(regCount + 1).padStart(4, '0'),
        subject: cas.title,
        urgencyLevel: (cas as any).urgencyLevel ?? 'normal',
        inboundCaseId: cas.id,
        academicYearId: cas.academicYearId ?? undefined,
      },
    });
    return { id: Number(entry.id) };
  }

  private async generateDocumentNo(organizationId: bigint, orgCode?: string): Promise<string> {
    const now = new Date();
    const buddhistYear = now.getFullYear() + 543;
    const prefix = orgCode ?? 'ORG';

    const count = await this.prisma.outboundDocument.count({
      where: {
        organizationId,
        documentNo: { not: null },
        documentDate: {
          gte: new Date(`${now.getFullYear()}-01-01`),
          lte: new Date(`${now.getFullYear()}-12-31`),
        },
      },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `${prefix} ${seq}/${buddhistYear}`;
  }

  private serialize(doc: any): any {
    return {
      ...doc,
      id: Number(doc.id),
      organizationId: Number(doc.organizationId),
      createdByUserId: doc.createdByUserId ? Number(doc.createdByUserId) : null,
      approvedByUserId: doc.approvedByUserId ? Number(doc.approvedByUserId) : null,
      relatedInboundCaseId: doc.relatedInboundCaseId ? Number(doc.relatedInboundCaseId) : null,
      createdBy: doc.createdBy ? { ...doc.createdBy, id: Number(doc.createdBy.id) } : null,
      approvedBy: doc.approvedBy ? { ...doc.approvedBy, id: Number(doc.approvedBy.id) } : null,
      relatedInboundCase: doc.relatedInboundCase
        ? { ...doc.relatedInboundCase, id: Number(doc.relatedInboundCase.id) }
        : null,
      documentRegistries: doc.documentRegistries?.map((r: any) => ({
        ...r,
        id: Number(r.id),
        organizationId: Number(r.organizationId),
        inboundCaseId: r.inboundCaseId ? Number(r.inboundCaseId) : null,
        outboundDocId: r.outboundDocId ? Number(r.outboundDocId) : null,
        academicYearId: r.academicYearId ? Number(r.academicYearId) : null,
      })),
    };
  }
}
