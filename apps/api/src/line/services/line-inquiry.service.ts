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

  // ─── อนุมัติส่ง (DIRECTOR) ─────────────────────────────

  async handleOutboundApprove(lineUserId: string, docId: number, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const allowedRoles = ['DIRECTOR', 'VICE_DIRECTOR', 'ADMIN'];
    if (!allowedRoles.includes(user.roleCode)) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage('⛔ คำสั่งนี้สำหรับผู้อำนวยการและรองผู้อำนวยการเท่านั้น'),
      ]);
      return;
    }

    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(docId) },
      include: { organization: { select: { orgCode: true } } },
    });

    if (!doc) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(`ไม่พบหนังสือออก #${docId}`),
      ]);
      return;
    }

    if (doc.status !== 'draft' && doc.status !== 'pending_approval') {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(`หนังสือออก #${docId} มีสถานะ "${doc.status}" ไม่สามารถอนุมัติได้`),
      ]);
      return;
    }

    // Generate document number
    const now = new Date();
    const buddhistYear = now.getFullYear() + 543;
    const orgCode = doc.organization?.orgCode ?? 'ORG';
    const count = await this.prisma.outboundDocument.count({
      where: { organizationId: doc.organizationId, documentNo: { not: null } },
    });
    const documentNo = `${orgCode} ${String(count + 1).padStart(4, '0')}/${buddhistYear}`;

    await this.prisma.outboundDocument.update({
      where: { id: BigInt(docId) },
      data: {
        status: 'approved',
        documentNo,
        approvedByUserId: user.id,
        approvedAt: new Date(),
        documentDate: new Date(),
      },
    });

    this.logger.log(`Director ${user.fullName} approved outbound doc #${docId} as ${documentNo}`);

    await this.messaging.reply(replyToken, [
      this.messaging.buildTextMessage(
        `✅ อนุมัติหนังสือออกสำเร็จ\n\nเลขที่หนังสือ: ${documentNo}\nเรื่อง: ${doc.subject}\n\nพิมพ์ "ทะเบียนส่ง" เพื่อดูรายการทั้งหมด`,
      ),
    ]);
  }

  // ─── รายการหนังสือออกรออนุมัติ (DIRECTOR) ─────────────

  async handlePendingOutbound(lineUserId: string, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const where: any = { status: { in: ['draft', 'pending_approval'] } };
    if (user.organizationId) where.organizationId = user.organizationId;

    const docs = await this.prisma.outboundDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { createdBy: { select: { fullName: true } } },
    });

    if (docs.length === 0) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage('ไม่มีหนังสือออกรออนุมัติในขณะนี้ ✅'),
      ]);
      return;
    }

    const URGENCY_ICON: Record<string, string> = {
      most_urgent: '🔴', very_urgent: '🟠', urgent: '🟡', normal: '🔵',
    };

    const lines = docs.map((d, i) => {
      const icon = URGENCY_ICON[d.urgencyLevel] ?? '⚪';
      const by = (d as any).createdBy?.fullName ? ` (โดย ${(d as any).createdBy.fullName})` : '';
      return `${i + 1}. ${icon} #${Number(d.id)} ${d.subject}${by}\n   พิมพ์: อนุมัติส่ง #${Number(d.id)}`;
    });

    await this.messaging.reply(replyToken, [
      this.messaging.buildTextMessage(
        `📋 หนังสือออกรออนุมัติ (${docs.length} รายการ)\n\n${lines.join('\n\n')}`,
      ),
    ]);
  }

  // ─── ดึงสาระสำคัญ ─────────────────────────────────────────

  async handleExtractKeyPoints(lineUserId: string, caseId: number, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
    });
    if (!c) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(`ไม่พบเรื่อง #${caseId}`),
      ]);
      return;
    }

    // หา AI result จาก intake link ใน description
    let aiResult: any = null;
    const intakeMatch = c.description?.match(/intake:(\d+)/);
    if (intakeMatch) {
      aiResult = await this.prisma.documentAiResult.findUnique({
        where: { documentIntakeId: BigInt(intakeMatch[1]) },
      });
    }

    const URGENCY_LABEL: Record<string, string> = {
      most_urgent: '🚨 ด่วนที่สุด', very_urgent: '⚡ ด่วนที่สุด',
      urgent: '⏰ ด่วน', normal: '📋 ปกติ',
    };

    const lines: string[] = [
      `🔑 สาระสำคัญ — เรื่อง #${caseId}`,
      ``,
      `📌 เรื่อง: ${c.title}`,
      `${URGENCY_LABEL[c.urgencyLevel] ?? '📋 ปกติ'}`,
    ];

    if (aiResult) {
      if (aiResult.issuingAuthority) lines.push(`🏢 จาก: ${aiResult.issuingAuthority}`);
      if (aiResult.documentNo)       lines.push(`📄 ที่: ${aiResult.documentNo}`);
      if (aiResult.documentDate)     lines.push(`📅 ลงวันที่: ${new Date(aiResult.documentDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`);
      if (aiResult.summaryText) {
        lines.push(``, `📝 สรุปสาระสำคัญ:`, aiResult.summaryText);
      }
      if (aiResult.deadlineDate) {
        lines.push(``, `⏳ กำหนดดำเนินการ: ${new Date(aiResult.deadlineDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`);
      }
      if (aiResult.nextActionJson) {
        const actions: string[] = JSON.parse(aiResult.nextActionJson);
        if (actions.length > 0) {
          lines.push(``, `✅ สิ่งที่ต้องดำเนินการ:`);
          actions.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`));
        }
      }
    }

    await this.messaging.reply(replyToken, [
      this.messaging.buildTextMessage(lines.join('\n')),
    ]);
  }

  // ─── ร่างหนังสือตอบ ─────────────────────────────────────

  async handleDraftReply(lineUserId: string, caseId: number, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
    });
    if (!c) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(`ไม่พบเรื่อง #${caseId}`),
      ]);
      return;
    }

    let aiResult: any = null;
    const intakeMatch = c.description?.match(/intake:(\d+)/);
    if (intakeMatch) {
      aiResult = await this.prisma.documentAiResult.findUnique({
        where: { documentIntakeId: BigInt(intakeMatch[1]) },
      });
    }

    const orgName = (user as any).organization?.name ?? 'สำนักงาน';
    const buddhistYear = new Date().getFullYear() + 543;
    const subject = aiResult?.subjectText || c.title;
    const fromOrg = aiResult?.issuingAuthority ?? 'หน่วยงานต้นเรื่อง';

    const draft = [
      `✉ ร่างหนังสือตอบ — เรื่อง #${caseId}`,
      ``,
      `ที่ ........./........`,
      `${orgName}`,
      `วันที่ ...... ${buddhistYear}`,
      ``,
      `เรื่อง ${subject}`,
      `เรียน ผู้บริหาร${fromOrg}`,
      ``,
      `ตามที่ ${fromOrg} ได้มีหนังสือ${aiResult?.documentNo ? ` ที่ ${aiResult.documentNo}` : ''} เรื่อง ${subject} มายัง ${orgName} นั้น`,
      ``,
      `${orgName} ขอเรียนว่า ...........................................................................`,
      `...................................................................................................`,
      ``,
      `จึงเรียนมาเพื่อโปรดทราบ`,
      ``,
      `ขอแสดงความนับถือ`,
      ``,
      `(.....................................)`,
      `ผู้อำนวยการ${orgName}`,
    ].join('\n');

    await this.messaging.reply(replyToken, [
      this.messaging.buildTextMessage(draft),
    ]);
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
