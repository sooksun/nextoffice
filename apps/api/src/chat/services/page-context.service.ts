import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PageContext {
  route: string;
  entityId?: number;
  searchQuery?: string;
  filters?: Record<string, string>;
}

export interface ResolvedPageContext {
  pageName: string;
  summary: string;
  details: string;
}

@Injectable()
export class PageContextService {
  private readonly logger = new Logger(PageContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(ctx: PageContext, userId?: number): Promise<ResolvedPageContext | null> {
    try {
      const route = ctx.route?.replace(/\/$/, '') || '/';

      // Detail pages — /inbox/:id
      const inboxDetail = route.match(/^\/inbox\/(\d+)$/);
      if (inboxDetail) {
        return this.resolveInboxDetail(Number(inboxDetail[1]));
      }

      // Detail pages — /cases/:id
      const caseDetail = route.match(/^\/cases\/(\d+)$/);
      if (caseDetail) {
        return this.resolveInboxDetail(Number(caseDetail[1]));
      }

      // Detail pages — /documents/:id
      const docDetail = route.match(/^\/documents\/(\d+)$/);
      if (docDetail) {
        return this.resolveDocumentDetail(Number(docDetail[1]));
      }

      // List pages
      switch (route) {
        case '/saraban/inbound':
          return this.resolveSarabanInbound(ctx.filters);
        case '/saraban/outbound':
          return this.resolveSarabanOutbound();
        case '/cases':
          return this.resolveCasesList();
        case '/inbox':
          return this.resolveInbox();
        case '/documents':
          return this.resolveDocumentsList();
        case '/intakes':
          return this.resolveIntakes();
        case '/outbound':
        case '/outbound/new':
          return this.resolveOutbound();
        case '/horizon':
        case '/horizon/agendas':
        case '/horizon/signals':
          return this.resolveHorizon(route);
        case '/':
          return this.resolveDashboard(userId);
        default:
          return this.resolveGenericPage(route);
      }
    } catch (err) {
      this.logger.warn(`Failed to resolve page context for ${ctx.route}: ${err}`);
      return null;
    }
  }

  private async resolveInboxDetail(caseId: number): Promise<ResolvedPageContext> {
    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: {
        organization: true,
        sourceDocument: true,
        assignedTo: true,
        assignments: { include: { assignedTo: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { user: true },
        },
      },
    });

    if (!c) {
      return { pageName: 'รายละเอียดเคส', summary: `ไม่พบเคส #${caseId}`, details: '' };
    }

    const assignees = c.assignments
      .map((a) => `${a.assignedTo?.fullName ?? '?'} (${a.status})`)
      .join(', ');

    const recentActivities = c.activities
      .map((a) => `- ${a.action}${a.user ? ` โดย ${a.user.fullName}` : ''}`)
      .join('\n');

    const details = [
      `เรื่อง: ${c.title}`,
      `สถานะ: ${c.status}`,
      `ความเร่งด่วน: ${c.urgencyLevel}`,
      c.registrationNo ? `เลขรับ: ${c.registrationNo}` : 'ยังไม่ได้ลงรับ',
      `หน่วยงาน: ${c.organization?.name ?? '-'}`,
      c.sourceDocument?.issuingAuthority ? `ผู้ส่ง: ${c.sourceDocument.issuingAuthority}` : null,
      c.sourceDocument?.documentCode ? `เลขที่หนังสือ: ${c.sourceDocument.documentCode}` : null,
      c.assignedTo ? `ผู้รับผิดชอบหลัก: ${c.assignedTo.fullName}` : null,
      assignees ? `ผู้ได้รับมอบหมาย: ${assignees}` : null,
      c.dueDate ? `กำหนดเสร็จ: ${c.dueDate.toISOString().split('T')[0]}` : null,
      c.directorNote ? `คำสั่งผู้บริหาร: ${c.directorNote}` : null,
      c.description ? `หมายเหตุ: ${c.description.substring(0, 500)}` : null,
      recentActivities ? `\nกิจกรรมล่าสุด:\n${recentActivities}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      pageName: 'รายละเอียดหนังสือเข้า',
      summary: `กำลังดู "${c.title}" (${c.status}) เลขรับ ${c.registrationNo ?? 'ยังไม่ลงรับ'}`,
      details,
    };
  }

  private async resolveDocumentDetail(docId: number): Promise<ResolvedPageContext> {
    const doc = await this.prisma.document.findUnique({
      where: { id: BigInt(docId) },
    });

    if (!doc) {
      return { pageName: 'รายละเอียดเอกสาร', summary: `ไม่พบเอกสาร #${docId}`, details: '' };
    }

    const details = [
      `ชื่อเอกสาร: ${doc.title}`,
      `ประเภท: ${doc.documentType}`,
      doc.issuingAuthority ? `หน่วยงานที่ออก: ${doc.issuingAuthority}` : null,
      doc.documentCode ? `เลขที่: ${doc.documentCode}` : null,
      doc.summaryText ? `สรุป: ${doc.summaryText.substring(0, 500)}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      pageName: 'รายละเอียดเอกสาร',
      summary: `กำลังดูเอกสาร "${doc.title}"`,
      details,
    };
  }

  private async resolveSarabanInbound(filters?: Record<string, string>): Promise<ResolvedPageContext> {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.urgencyLevel) where.urgencyLevel = filters.urgencyLevel;

    const [total, recent] = await Promise.all([
      this.prisma.inboundCase.count({ where }),
      this.prisma.inboundCase.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: 10,
        include: { sourceDocument: true, assignedTo: true },
      }),
    ]);

    const recentList = recent
      .map(
        (c) =>
          `- ${c.registrationNo ?? '#' + Number(c.id)} | ${c.title} | ${c.status} | ${c.urgencyLevel}` +
          (c.assignedTo ? ` | ผู้รับผิดชอบ: ${c.assignedTo.fullName}` : ''),
      )
      .join('\n');

    const filterDesc = filters
      ? Object.entries(filters)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')
      : '';

    return {
      pageName: 'ทะเบียนรับหนังสือเข้า',
      summary: `หน้าทะเบียนรับ มี ${total} รายการ${filterDesc ? ` (ตัวกรอง: ${filterDesc})` : ''}`,
      details: `รายการล่าสุด 10 รายการ:\n${recentList}`,
    };
  }

  private async resolveSarabanOutbound(): Promise<ResolvedPageContext> {
    const total = await this.prisma.outboundDocument.count();
    const recent = await this.prisma.outboundDocument.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const recentList = recent
      .map((d) => `- ${d.registrationNo ?? '#' + Number(d.id)} | ${d.subject} | ${d.status}`)
      .join('\n');

    return {
      pageName: 'ทะเบียนส่งหนังสือ',
      summary: `หน้าทะเบียนส่ง มี ${total} รายการ`,
      details: `รายการล่าสุด:\n${recentList}`,
    };
  }

  private async resolveCasesList(): Promise<ResolvedPageContext> {
    const statusCounts = await this.prisma.inboundCase.groupBy({
      by: ['status'],
      _count: true,
    });
    const summary = statusCounts
      .map((s) => `${s.status}: ${s._count} รายการ`)
      .join(', ');

    return {
      pageName: 'รายการเคสทั้งหมด',
      summary: `หน้ารายการเคส — ${summary}`,
      details: '',
    };
  }

  private async resolveInbox(): Promise<ResolvedPageContext> {
    const recent = await this.prisma.inboundCase.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 10,
      include: { sourceDocument: true },
    });

    const list = recent
      .map((c) => `- ${c.title} (${c.status}, ${c.urgencyLevel})`)
      .join('\n');

    return {
      pageName: 'เอกสารเข้า',
      summary: `หน้าเอกสารเข้า แสดงหนังสือที่เข้ามาล่าสุด`,
      details: `รายการล่าสุด:\n${list}`,
    };
  }

  private async resolveDocumentsList(): Promise<ResolvedPageContext> {
    const total = await this.prisma.document.count();
    return {
      pageName: 'คลังเอกสาร',
      summary: `หน้าคลังเอกสาร มี ${total} เอกสาร`,
      details: '',
    };
  }

  private async resolveIntakes(): Promise<ResolvedPageContext> {
    const total = await this.prisma.documentIntake.count();
    const pending = await this.prisma.documentIntake.count({
      where: { ocrStatus: { not: 'completed' } },
    });

    return {
      pageName: 'AI ประมวลผลเอกสาร',
      summary: `หน้า Document Intake มี ${total} รายการ (${pending} รอประมวลผล)`,
      details: '',
    };
  }

  private async resolveOutbound(): Promise<ResolvedPageContext> {
    const total = await this.prisma.outboundDocument.count();
    return {
      pageName: 'หนังสือส่งออก',
      summary: `หน้าหนังสือส่งออก มี ${total} รายการ`,
      details: '',
    };
  }

  private async resolveHorizon(route: string): Promise<ResolvedPageContext> {
    const subpage =
      route === '/horizon/agendas'
        ? 'วาระนโยบาย'
        : route === '/horizon/signals'
          ? 'สัญญาณ'
          : 'ภาพรวม Horizon Intelligence';

    return {
      pageName: subpage,
      summary: `หน้า ${subpage} — ข้อมูลแนวโน้มนโยบายและสัญญาณการเปลี่ยนแปลง`,
      details: '',
    };
  }

  private async resolveDashboard(userId?: number): Promise<ResolvedPageContext> {
    const [caseCount, intakeCount] = await Promise.all([
      this.prisma.inboundCase.count(),
      this.prisma.documentIntake.count(),
    ]);

    return {
      pageName: 'แดชบอร์ด',
      summary: `หน้าแรก — เคสทั้งหมด ${caseCount}, เอกสารที่อัปโหลด ${intakeCount}`,
      details: '',
    };
  }

  private resolveGenericPage(route: string): ResolvedPageContext {
    const ROUTE_NAMES: Record<string, string> = {
      '/work-groups': 'โครงสร้างองค์กร',
      '/organizations': 'หน่วยงาน',
      '/knowledge': 'ฐานข้อมูลความรู้',
      '/vault': 'Knowledge Vault',
      '/vault/graph': 'Knowledge Graph',
      '/projects': 'โครงการ',
      '/settings/prompts': 'ตั้งค่า AI Prompts',
      '/notifications': 'การแจ้งเตือน',
      '/help': 'ศูนย์ช่วยเหลือ',
    };

    const pageName = ROUTE_NAMES[route] || route;

    return {
      pageName,
      summary: `ผู้ใช้อยู่ที่หน้า "${pageName}"`,
      details: '',
    };
  }
}
