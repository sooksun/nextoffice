import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CasesService } from '../cases/services/cases.service';
import { buildTrigramBooleanQuery } from '../search/search-trigram.util';

const MAX_LIMIT = 20;

/**
 * Read-only data access for Dify Agent tools (Phase 5).
 * Always scoped to a single organizationId from the tools guard.
 */
@Injectable()
export class DifyToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
  ) {}

  async search(organizationId: number, q: string, limitRaw?: number) {
    const term = (q ?? '').trim();
    if (term.length < 2) return { q: term, hits: [] as any[] };

    const limit = Math.min(Math.max(limitRaw || 8, 1), MAX_LIMIT);
    const orgId = BigInt(organizationId);
    const bool = buildTrigramBooleanQuery(term);

    const [cases, outbound] = await Promise.all([
      this.searchCases(term, bool, orgId, limit),
      this.searchOutbound(term, orgId, Math.ceil(limit / 2)),
    ]);

    return {
      q: term,
      organizationId,
      hits: [...cases, ...outbound].slice(0, limit),
    };
  }

  async getCase(organizationId: number, caseId: number) {
    // Reuse CasesService org check (non-ADMIN path)
    const c = await this.cases.findById(caseId, organizationId, 'TEACHER');
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      urgencyLevel: c.urgencyLevel,
      registrationNo: c.registrationNo,
      description: c.description ? String(c.description).slice(0, 2000) : null,
      dueDate: c.dueDate,
      createdAt: c.createdAt,
      intake: c.intake
        ? {
            documentNo: c.intake.documentNo,
            issuingAuthority: c.intake.issuingAuthority,
            documentDate: c.intake.documentDate,
            summaryText: c.intake.summaryText
              ? String(c.intake.summaryText).slice(0, 2000)
              : null,
            nextActions: c.intake.nextActions ?? [],
          }
        : null,
      assignedTo: c.assignedTo
        ? { id: c.assignedTo.id, fullName: c.assignedTo.fullName }
        : null,
    };
  }

  async listCases(
    organizationId: number,
    opts: { status?: string; urgency?: string; limit?: number },
  ) {
    const take = Math.min(Math.max(opts.limit || 10, 1), MAX_LIMIT);
    const where: any = { organizationId: BigInt(organizationId) };
    if (opts.status) where.status = opts.status;
    if (opts.urgency) where.urgencyLevel = opts.urgency;

    const rows = await this.prisma.inboundCase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        title: true,
        status: true,
        urgencyLevel: true,
        registrationNo: true,
        dueDate: true,
        createdAt: true,
        hasBeenReplied: true,
      },
    });

    return {
      organizationId,
      total: rows.length,
      cases: rows.map((r) => ({
        id: Number(r.id),
        title: r.title,
        status: r.status,
        urgencyLevel: r.urgencyLevel,
        registrationNo: r.registrationNo,
        dueDate: r.dueDate,
        createdAt: r.createdAt,
        hasBeenReplied: r.hasBeenReplied,
      })),
    };
  }

  async getOutbound(organizationId: number, id: number) {
    const doc = await this.prisma.outboundDocument.findFirst({
      where: { id: BigInt(id), organizationId: BigInt(organizationId) },
      select: {
        id: true,
        subject: true,
        status: true,
        letterType: true,
        documentNo: true,
        documentDate: true,
        recipientOrg: true,
        recipientName: true,
        urgencyLevel: true,
        relatedInboundCaseId: true,
        createdAt: true,
        bodyText: true,
      },
    });
    if (!doc) throw new NotFoundException(`Outbound #${id} not found`);

    return {
      id: Number(doc.id),
      subject: doc.subject,
      status: doc.status,
      letterType: doc.letterType,
      documentNo: doc.documentNo,
      documentDate: doc.documentDate,
      recipientOrg: doc.recipientOrg,
      recipientName: doc.recipientName,
      urgencyLevel: doc.urgencyLevel,
      relatedInboundCaseId: doc.relatedInboundCaseId
        ? Number(doc.relatedInboundCaseId)
        : null,
      createdAt: doc.createdAt,
      // Truncate body for agent context
      bodyExcerpt: doc.bodyText ? String(doc.bodyText).slice(0, 1500) : null,
    };
  }

  async searchRegistry(organizationId: number, q: string, limitRaw?: number) {
    const term = (q ?? '').trim();
    if (term.length < 2) return { q: term, entries: [] as any[] };
    const take = Math.min(Math.max(limitRaw || 10, 1), MAX_LIMIT);

    const entries = await this.prisma.documentRegistry.findMany({
      where: {
        organizationId: BigInt(organizationId),
        OR: [
          { subject: { contains: term } },
          { documentNo: { contains: term } },
          { registryNo: { contains: term } },
          { fromOrg: { contains: term } },
          { toOrg: { contains: term } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        registryType: true,
        registryNo: true,
        documentNo: true,
        subject: true,
        fromOrg: true,
        toOrg: true,
        urgencyLevel: true,
        inboundCaseId: true,
        outboundDocId: true,
        createdAt: true,
      },
    });

    return {
      q: term,
      organizationId,
      entries: entries.map((e) => ({
        id: Number(e.id),
        registryType: e.registryType,
        registryNo: e.registryNo,
        documentNo: e.documentNo,
        subject: e.subject,
        fromOrg: e.fromOrg,
        toOrg: e.toOrg,
        urgencyLevel: e.urgencyLevel,
        inboundCaseId: e.inboundCaseId ? Number(e.inboundCaseId) : null,
        outboundDocId: e.outboundDocId ? Number(e.outboundDocId) : null,
        createdAt: e.createdAt,
      })),
    };
  }

  private async searchCases(
    term: string,
    bool: string | null,
    orgId: bigint,
    limit: number,
  ) {
    if (bool) {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          id: bigint;
          title: string;
          registrationNo: string | null;
          status: string;
        }>
      >(
        'SELECT id, title, registration_no AS registrationNo, status FROM inbound_cases ' +
          'WHERE MATCH(search_text) AGAINST(? IN BOOLEAN MODE) AND organization_id = ? ' +
          `ORDER BY created_at DESC LIMIT ${limit}`,
        bool,
        orgId,
      );
      return rows.map((r) => ({
        type: 'case' as const,
        id: Number(r.id),
        title: r.title,
        subtitle: r.registrationNo ? `เลขรับ ${r.registrationNo}` : r.status,
      }));
    }

    const rows = await this.prisma.inboundCase.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { title: { contains: term } },
          { registrationNo: { contains: term } },
          { description: { contains: term } },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, registrationNo: true, status: true },
    });
    return rows.map((r) => ({
      type: 'case' as const,
      id: Number(r.id),
      title: r.title,
      subtitle: r.registrationNo ? `เลขรับ ${r.registrationNo}` : r.status,
    }));
  }

  private async searchOutbound(term: string, orgId: bigint, limit: number) {
    const rows = await this.prisma.outboundDocument.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { subject: { contains: term } },
          { documentNo: { contains: term } },
          { recipientOrg: { contains: term } },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subject: true,
        documentNo: true,
        status: true,
      },
    });
    return rows.map((r) => ({
      type: 'outbound' as const,
      id: Number(r.id),
      title: r.subject,
      subtitle: r.documentNo ? `เลขส่ง ${r.documentNo}` : r.status,
    }));
  }
}
