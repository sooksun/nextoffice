import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LineMessagingService } from './line-messaging.service';

@Injectable()
export class LineInquiryService {
  private readonly logger = new Logger(LineInquiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: LineMessagingService,
  ) {}

  // ─── ทะเบียนรับ ─────────────────────────────────────────

  async handleSarabanInbound(
    lineUserId: string,
    replyToken: string,
    filter?: 'urgent' | 'pending' | 'today',
  ): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const where: any = {};
    if (user.organizationId) where.organizationId = user.organizationId;

    if (filter === 'urgent') {
      where.urgencyLevel = { in: ['urgent', 'very_urgent', 'most_urgent'] };
    } else if (filter === 'pending') {
      where.status = { in: ['new', 'analyzing', 'proposed', 'registered'] };
    } else if (filter === 'today') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      where.receivedAt = { gte: startOfDay };
    }

    const cases = await this.prisma.inboundCase.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: 10,
      include: {
        sourceDocument: { select: { issuingAuthority: true, documentCode: true } },
        assignedTo: { select: { fullName: true } },
      },
    });

    const total = await this.prisma.inboundCase.count({ where });
    const messages = this.messaging.buildSarabanInboundCarousel(cases, total, filter);
    await this.messaging.reply(replyToken, messages);
  }

  // ─── ทะเบียนส่ง ─────────────────────────────────────────

  async handleSarabanOutbound(lineUserId: string, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const where: any = {};
    if (user.organizationId) where.organizationId = user.organizationId;

    const docs = await this.prisma.outboundDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const total = await this.prisma.outboundDocument.count({ where });
    const messages = this.messaging.buildSarabanOutboundCarousel(docs, total);
    await this.messaging.reply(replyToken, messages);
  }

  // ─── ดูรายละเอียดเคส ────────────────────────────────────

  async handleCaseDetail(lineUserId: string, caseId: number, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: {
        organization: { select: { name: true } },
        sourceDocument: { select: { issuingAuthority: true, documentCode: true } },
        assignedTo: { select: { fullName: true } },
        assignments: {
          include: { assignedTo: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        activities: {
          include: { user: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!c) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(`ไม่พบเรื่อง #${caseId}`),
      ]);
      return;
    }

    const messages = this.messaging.buildCaseDetailFlex(c);
    await this.messaging.reply(replyToken, messages);
  }

  // ─── ค้นหาเคส ────────────────────────────────────────

  async handleSearchCases(lineUserId: string, keyword: string, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const where: any = {
      title: { contains: keyword },
    };
    if (user.organizationId) where.organizationId = user.organizationId;

    const cases = await this.prisma.inboundCase.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: 10,
      include: {
        sourceDocument: { select: { issuingAuthority: true } },
        assignedTo: { select: { fullName: true } },
      },
    });

    if (cases.length === 0) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(`ไม่พบผลลัพธ์สำหรับ "${keyword}"`),
      ]);
      return;
    }

    const messages = this.messaging.buildSearchResultsCarousel(cases, keyword);
    await this.messaging.reply(replyToken, messages);
  }

  // ─── แดชบอร์ด / ภาพรวม ─────────────────────────────────

  async handleDashboard(lineUserId: string, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const orgWhere: any = {};
    if (user.organizationId) orgWhere.organizationId = user.organizationId;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      totalCases,
      todayInbound,
      urgentCount,
      pendingCount,
      overdueCount,
      myTaskCount,
      recentCases,
    ] = await Promise.all([
      this.prisma.inboundCase.count({ where: orgWhere }),
      this.prisma.inboundCase.count({ where: { ...orgWhere, receivedAt: { gte: startOfDay } } }),
      this.prisma.inboundCase.count({ where: { ...orgWhere, urgencyLevel: { in: ['urgent', 'very_urgent', 'most_urgent'] }, status: { notIn: ['completed', 'archived'] } } }),
      this.prisma.inboundCase.count({ where: { ...orgWhere, status: { in: ['new', 'analyzing', 'proposed', 'registered'] } } }),
      this.prisma.inboundCase.count({ where: { ...orgWhere, dueDate: { lt: new Date() }, status: { notIn: ['completed', 'archived'] } } }),
      this.prisma.caseAssignment.count({ where: { assignedToUserId: user.id, status: { not: 'completed' } } }),
      this.prisma.inboundCase.findMany({
        where: orgWhere,
        orderBy: { receivedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, urgencyLevel: true, status: true },
      }),
    ]);

    const messages = this.messaging.buildDashboardFlex({
      userName: user.fullName,
      orgName: user.organization?.name || '-',
      totalCases,
      todayInbound,
      urgentCount,
      pendingCount,
      overdueCount,
      myTaskCount,
      recentCases: recentCases.map((c) => ({
        id: Number(c.id),
        title: c.title,
        urgency: c.urgencyLevel,
        status: c.status,
      })),
    });
    await this.messaging.reply(replyToken, messages);
  }

  // ─── งานเกินกำหนด ──────────────────────────────────────

  async handleOverdue(lineUserId: string, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const orgWhere: any = {};
    if (user.organizationId) orgWhere.organizationId = user.organizationId;

    const cases = await this.prisma.inboundCase.findMany({
      where: {
        ...orgWhere,
        dueDate: { lt: new Date() },
        status: { notIn: ['completed', 'archived'] },
      },
      orderBy: { dueDate: 'asc' },
      take: 10,
      include: {
        assignedTo: { select: { fullName: true } },
      },
    });

    if (cases.length === 0) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage('ไม่มีงานเกินกำหนดในขณะนี้ ✅'),
      ]);
      return;
    }

    const messages = this.messaging.buildOverdueCarousel(cases);
    await this.messaging.reply(replyToken, messages);
  }

  // ─── เมนูหลัก ──────────────────────────────────────────

  async handleMainMenu(replyToken: string): Promise<void> {
    const messages = this.messaging.buildMainMenu();
    await this.messaging.reply(replyToken, messages);
  }

  // ─── Helpers ────────────────────────────────────────────

  private async findLinkedUser(lineUserId: string) {
    const lineUser = await this.prisma.lineUser.findUnique({
      where: { lineUserId },
      include: { user: { include: { organization: true } } },
    });
    return lineUser?.user || null;
  }

  private async replyNotLinked(replyToken: string) {
    await this.messaging.reply(replyToken, [
      this.messaging.buildTextMessage(
        'บัญชี LINE ยังไม่ผูกกับระบบ\nกรุณาพิมพ์ "ผูกบัญชี XXXXXX" (รหัส 6 หลักจาก Admin)',
      ),
    ]);
  }
}
