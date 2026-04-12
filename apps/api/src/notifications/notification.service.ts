import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LineMessagingService } from '../line/services/line-messaging.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: LineMessagingService,
    private readonly config: ConfigService,
  ) {}

  /** G1-A: หนังสือด่วนที่สุด ยังไม่ลงรับภายใน 1 ชั่วโมง */
  async alertMostUrgentUnregistered() {
    const threshold = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const cases = await this.prisma.inboundCase.findMany({
      where: {
        urgencyLevel: 'most_urgent',
        status: { in: ['new', 'analyzing', 'proposed'] },
        receivedAt: { lt: threshold },
      },
      include: {
        organization: {
          include: {
            users: {
              where: { roleCode: { in: ['DIRECTOR', 'CLERK', 'ADMIN'] }, isActive: true },
              include: { lineUser: { select: { lineUserId: true } } },
            },
          },
        },
      },
    });

    for (const c of cases) {
      const minutesLate = Math.round((Date.now() - c.receivedAt.getTime()) / 60000);
      const msg = `⚠️ แจ้งเตือน: หนังสือด่วนที่สุด\n"${c.title.substring(0, 60)}"\nยังไม่ได้ลงรับมาแล้ว ${minutesLate} นาที\nกรุณาดำเนินการทันที`;

      for (const user of c.organization.users) {
        if (user.lineUser?.lineUserId) {
          await this.sendLineNotification(user.lineUser.lineUserId, msg);
        }
      }
    }
    this.logger.log(`alertMostUrgentUnregistered: checked ${cases.length} cases`);
  }

  /** G1-B: deadline ใกล้ (3 วัน และ 1 วัน) — แจ้งผู้รับผิดชอบ */
  async alertDeadlineApproaching() {
    const now = new Date();
    const in1Day = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const cases = await this.prisma.inboundCase.findMany({
      where: {
        status: { notIn: ['completed', 'archived'] },
        dueDate: { gte: now, lte: in3Days },
      },
      include: {
        assignedTo: {
          include: { lineUser: { select: { lineUserId: true } } },
        },
      },
    });

    for (const c of cases) {
      if (!c.dueDate || !c.assignedTo?.lineUser?.lineUserId) continue;
      const daysLeft = Math.ceil((c.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const urgencyEmoji = daysLeft <= 1 ? '🚨' : '⏰';
      const msg = `${urgencyEmoji} กำหนดส่งงาน ${daysLeft <= 1 ? 'พรุ่งนี้' : 'ใน 3 วัน'}\n#${c.registrationNo ?? c.id} "${c.title.substring(0, 60)}"\nกำหนด: ${c.dueDate.toLocaleDateString('th-TH')}\nกรุณาดำเนินการให้เสร็จ`;
      await this.sendLineNotification(c.assignedTo.lineUser.lineUserId, msg);
    }
    this.logger.log(`alertDeadlineApproaching: notified for ${cases.length} cases`);
  }

  /** G1-C: งานค้างเกิน 7 วัน — รายงานสรุปส่ง ผอ. */
  async sendWeeklyOverdueReport() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const orgs = await this.prisma.organization.findMany({
      where: { isActive: true },
      include: {
        users: {
          where: { roleCode: 'DIRECTOR', isActive: true },
          include: { lineUser: { select: { lineUserId: true } } },
        },
      },
    });

    for (const org of orgs) {
      const overdue = await this.prisma.inboundCase.count({
        where: {
          organizationId: org.id,
          status: { notIn: ['completed', 'archived'] },
          dueDate: { lt: sevenDaysAgo },
        },
      });

      if (overdue === 0) continue;

      const directors = org.users.filter((u) => u.lineUser?.lineUserId);
      const msg = `📊 รายงานประจำสัปดาห์\n${org.name}\n\nงานค้างเกิน 7 วัน: ${overdue} เรื่อง\nกรุณาตรวจสอบและเร่งรัดการดำเนินงาน\n\nดูรายละเอียดที่ nextoffice.cnppai.com`;

      for (const d of directors) {
        if (d.lineUser?.lineUserId) {
          await this.sendLineNotification(d.lineUser.lineUserId, msg);
        }
      }
    }
    this.logger.log('sendWeeklyOverdueReport: completed');
  }

  /** G1-D: แจ้งเตือนให้เช็คระบบ 2 ครั้ง/วัน (เฉพาะผู้ที่มีงานค้าง) */
  async sendDailyCheckReminder() {
    const pendingAssignments = await this.prisma.caseAssignment.findMany({
      where: { status: 'pending' },
      include: {
        assignedTo: {
          include: { lineUser: { select: { lineUserId: true } } },
        },
        inboundCase: { select: { title: true, registrationNo: true } },
      },
      distinct: ['assignedToUserId'],
      take: 100,
    });

    for (const a of pendingAssignments) {
      if (!a.assignedTo.lineUser?.lineUserId) continue;
      const msg = `📋 เตือนงานที่รอดำเนินการ\nคุณมีงานที่ยังไม่ได้รับทราบ\n"${a.inboundCase.title.substring(0, 60)}"\nพิมพ์ "งานของฉัน" เพื่อดูรายการทั้งหมด`;
      await this.sendLineNotification(a.assignedTo.lineUser.lineUserId, msg);
    }
    this.logger.log(`sendDailyCheckReminder: reminded ${pendingAssignments.length} users`);
  }

  /** G1-E: แจ้งผู้รับผิดชอบเมื่อ SmartRouting assign เคสใหม่ */
  async notifyNewCaseAssigned(caseId: number, assignedUserId: number) {
    const [c, user] = await Promise.all([
      this.prisma.inboundCase.findUnique({ where: { id: BigInt(caseId) } }),
      this.prisma.user.findUnique({
        where: { id: BigInt(assignedUserId) },
        include: { lineUser: { select: { lineUserId: true } } },
      }),
    ]);
    if (!c || !user?.lineUser?.lineUserId) return;

    const urgencyText = c.urgencyLevel === 'most_urgent' ? '🚨 ด่วนที่สุด' :
                        c.urgencyLevel === 'very_urgent' ? '⚡ ด่วนที่สุด' :
                        c.urgencyLevel === 'urgent' ? '⏰ ด่วน' : '📋 ปกติ';

    const msg = `${urgencyText}\nมีหนังสือใหม่มอบหมายให้คุณ\n\n"${c.title.substring(0, 80)}"\n\n${c.dueDate ? `กำหนด: ${c.dueDate.toLocaleDateString('th-TH')}\n` : ''}พิมพ์ "งานของฉัน" เพื่อดูรายการทั้งหมด`;

    await this.sendLineNotification(user.lineUser.lineUserId, msg);
    this.logger.log(`notifyNewCaseAssigned: case #${caseId} → user #${assignedUserId}`);
  }

  /** G1-F: แจ้งผู้รับผิดชอบเมื่อเคสถูกลงรับอย่างเป็นทางการ */
  async notifyCaseRegistered(caseId: number) {
    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: {
        assignedTo: { include: { lineUser: { select: { lineUserId: true } } } },
      },
    });
    if (!c || !c.assignedTo?.lineUser?.lineUserId) return;

    const msg = `✅ หนังสือลงรับแล้ว\nเลขรับ: ${c.registrationNo}\n"${c.title.substring(0, 80)}"\n\nกรุณาดำเนินการตามที่ได้รับมอบหมาย\nพิมพ์ "รับทราบ #${c.registrationNo?.split('/')[0]}" เพื่อยืนยัน`;

    await this.sendLineNotification(c.assignedTo.lineUser.lineUserId, msg);
    this.logger.log(`notifyCaseRegistered: case #${caseId} notified assigned user`);
  }

  /** G2-A: แจ้งเอกสารเข้าใหม่ ไปยัง ผอ./ธุรการ */
  async notifyNewDocumentArrived(caseId: number) {
    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: {
        organization: {
          include: {
            users: {
              where: { roleCode: { in: ['DIRECTOR', 'CLERK', 'ADMIN'] }, isActive: true },
              include: { lineUser: { select: { lineUserId: true } } },
            },
          },
        },
      },
    });
    if (!c) return;

    const urgencyText = c.urgencyLevel === 'most_urgent' ? '🚨 ด่วนที่สุด' :
                        c.urgencyLevel === 'very_urgent' ? '⚡ ด่วนที่สุด' :
                        c.urgencyLevel === 'urgent' ? '⏰ ด่วน' : '📨 ทั่วไป';

    const flexMessage = {
      type: 'flex',
      altText: `เอกสารเข้าใหม่: ${c.title.substring(0, 40)}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box', layout: 'vertical',
          contents: [{ type: 'text', text: '📨 เอกสารเข้าใหม่', weight: 'bold', size: 'md', color: '#1a73e8' }],
          paddingBottom: 'sm',
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'sm',
          contents: [
            { type: 'text', text: urgencyText, size: 'sm', color: c.urgencyLevel === 'most_urgent' ? '#dc2626' : '#666666' },
            { type: 'text', text: c.title.substring(0, 80), weight: 'bold', size: 'sm', wrap: true },
            ...(c.dueDate ? [{ type: 'text', text: `กำหนด: ${c.dueDate.toLocaleDateString('th-TH')}`, size: 'xs', color: '#999999' }] : []),
          ],
        },
        footer: {
          type: 'box', layout: 'horizontal', spacing: 'sm',
          contents: [
            { type: 'button', style: 'primary', height: 'sm', action: { type: 'message', label: 'ลงรับ', text: `ลงรับ #${c.id}` } },
            { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: 'ดูรายละเอียด', text: `ดู #${c.id}` } },
          ],
        },
      },
    };

    for (const user of c.organization.users) {
      if (user.lineUser?.lineUserId) {
        await this.sendLineMessage(user.lineUser.lineUserId, flexMessage);
      }
    }
    this.logger.log(`notifyNewDocumentArrived: case #${caseId} notified ${c.organization.users.length} users`);
  }

  /** G2-B: แจ้งเมื่อสถานะเปลี่ยน */
  async notifyStatusChanged(caseId: number, fromStatus: string, toStatus: string, changedByUserId?: number) {
    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: {
        assignedTo: { include: { lineUser: { select: { lineUserId: true } } } },
        organization: {
          include: {
            users: {
              where: { roleCode: { in: ['DIRECTOR'] }, isActive: true },
              include: { lineUser: { select: { lineUserId: true } } },
            },
          },
        },
      },
    });
    if (!c) return;

    const statusLabel: Record<string, string> = {
      new: 'ใหม่', registered: 'ลงรับแล้ว', assigned: 'มอบหมายแล้ว',
      in_progress: 'กำลังดำเนินการ', completed: 'เสร็จสิ้น', archived: 'เก็บถาวร',
    };

    const emoji = toStatus === 'completed' ? '✅' :
                  toStatus === 'assigned' ? '📋' :
                  toStatus === 'registered' ? '📝' : '🔄';

    const msg = `${emoji} สถานะเปลี่ยน\n#${c.registrationNo || c.id} "${c.title.substring(0, 60)}"\n${statusLabel[fromStatus] || fromStatus} → ${statusLabel[toStatus] || toStatus}`;

    // Notify assigned user
    if (c.assignedTo?.lineUser?.lineUserId) {
      await this.sendLineNotification(c.assignedTo.lineUser.lineUserId, msg);
    }

    // Notify director on completion
    if (toStatus === 'completed') {
      for (const director of c.organization.users) {
        if (director.lineUser?.lineUserId && director.id !== c.assignedToUserId) {
          await this.sendLineNotification(director.lineUser.lineUserId, msg);
        }
      }
    }

    this.logger.log(`notifyStatusChanged: case #${caseId} ${fromStatus} → ${toStatus}`);
  }

  /** V2: Executive Snapshot — ส่งสรุปประจำเช้าให้ ผอ. ทุกหน่วยงาน */
  async sendExecutiveSnapshot() {
    if (!this.config.get('ENABLE_EXECUTIVE_SNAPSHOT')) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const orgs = await this.prisma.organization.findMany({
      where: { isActive: true },
      include: {
        users: {
          where: { roleCode: { in: ['DIRECTOR', 'VICE_DIRECTOR'] }, isActive: true },
          include: { lineUser: { select: { lineUserId: true } } },
        },
      },
    });

    for (const org of orgs) {
      const directors = org.users.filter((u) => u.lineUser?.lineUserId);
      if (directors.length === 0) continue;

      const orgId = org.id;
      const [totalInbound, urgentCount, pendingCount, overdueCount, recentCases] = await Promise.all([
        this.prisma.inboundCase.count({ where: { organizationId: orgId, createdAt: { gte: today, lt: tomorrow } } }),
        this.prisma.inboundCase.count({ where: { organizationId: orgId, urgencyLevel: { in: ['urgent', 'very_urgent', 'most_urgent'] }, status: { notIn: ['completed', 'archived'] } } }),
        this.prisma.inboundCase.count({ where: { organizationId: orgId, status: { in: ['new', 'analyzing', 'proposed', 'registered'] } } }),
        this.prisma.inboundCase.count({ where: { organizationId: orgId, dueDate: { lt: today }, status: { notIn: ['completed', 'archived'] } } }),
        this.prisma.inboundCase.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, take: 5, select: { title: true, urgencyLevel: true, status: true } }),
      ]);

      const dateStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear() + 543}`;
      const messages = this.messaging.buildExecutiveSnapshotFlex({
        date: dateStr,
        totalInbound,
        urgentCount,
        pendingCount,
        overdueCount,
        recentItems: recentCases.map((c) => ({ title: c.title, urgency: c.urgencyLevel, status: c.status })),
      });

      for (const director of directors) {
        if (director.lineUser?.lineUserId) {
          await this.messaging.push(director.lineUser.lineUserId, messages);
        }
      }
    }
    this.logger.log(`sendExecutiveSnapshot: sent to ${orgs.length} orgs`);
  }

  /** Notify director(s) when stamps 1+2 are applied and signing is pending */
  async notifyDirectorPendingSigning(caseId: number, proposedByName: string): Promise<void> {
    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: {
        organization: {
          include: {
            users: {
              where: { roleCode: { in: ['DIRECTOR', 'VICE_DIRECTOR'] }, isActive: true },
              include: { lineUser: { select: { lineUserId: true } } },
            },
          },
        },
      },
    });
    if (!c) return;

    const directors = c.organization.users.filter(u => u.lineUser?.lineUserId);
    const webUrl = this.config.get('WEB_URL') || 'https://nextoffice.cnppai.com';
    const urgencyEmoji = c.urgencyLevel === 'most_urgent' ? '🚨' : c.urgencyLevel === 'urgent' ? '⏰' : '📋';

    for (const director of directors) {
      await this.messaging.push(director.lineUser.lineUserId, [{
        type: 'flex',
        altText: `${urgencyEmoji} หนังสือรอลงนาม: ${c.title.substring(0, 30)}`,
        contents: {
          type: 'bubble',
          size: 'kilo',
          header: {
            type: 'box', layout: 'vertical', backgroundColor: '#7c3aed', paddingAll: 'md',
            contents: [
              { type: 'text', text: `${urgencyEmoji} หนังสือรอลงนามเกษียณ`, weight: 'bold', size: 'sm', color: '#ffffff' },
            ],
          },
          body: {
            type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'md',
            contents: [
              { type: 'text', text: c.title.substring(0, 60), size: 'sm', weight: 'bold', wrap: true },
              { type: 'separator', margin: 'sm' },
              { type: 'box', layout: 'vertical', margin: 'sm', spacing: 'xs', contents: [
                { type: 'box', layout: 'horizontal', contents: [
                  { type: 'text', text: 'เลขรับ', size: 'xs', color: '#888888', flex: 2 },
                  { type: 'text', text: c.registrationNo || '-', size: 'xs', color: '#333333', flex: 3, weight: 'bold' },
                ]},
                { type: 'box', layout: 'horizontal', contents: [
                  { type: 'text', text: 'เสนอโดย', size: 'xs', color: '#888888', flex: 2 },
                  { type: 'text', text: proposedByName, size: 'xs', color: '#333333', flex: 3 },
                ]},
              ]},
            ],
          },
          footer: {
            type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: 'md',
            contents: [
              {
                type: 'button', style: 'primary', height: 'sm', flex: 1,
                color: '#7c3aed',
                action: { type: 'uri', label: '✍ ลงนาม', uri: `${webUrl}/director/signing/${caseId}` },
              },
              {
                type: 'button', style: 'secondary', height: 'sm', flex: 1,
                action: { type: 'message', label: 'ลงนามเร็ว', text: `ลงนาม #${caseId}` },
              },
            ],
          },
        },
      }]);
    }
    this.logger.log(`notifyDirectorPendingSigning: case #${caseId} notified ${directors.length} directors`);
  }

  /** Notify all assignees + clerk when director signs stamp 3 */
  async notifyAssigneesDirectorSigned(caseId: number, directorName: string, noteText: string): Promise<void> {
    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: {
        assignments: {
          include: {
            assignedTo: { include: { lineUser: { select: { lineUserId: true } } } },
          },
        },
        registeredBy: { include: { lineUser: { select: { lineUserId: true } } } },
      },
    });
    if (!c) return;

    const dueLabel = c.dueDate
      ? c.dueDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'ไม่ระบุ';

    // Flex message with director command — sent to assignees
    const assigneeFlexMessage: any = {
      type: 'flex',
      altText: `📌 คำสั่ง ผอ.: ${c.title.substring(0, 30)}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#1B5E20', paddingAll: 'md',
          contents: [
            { type: 'text', text: '📌 คำสั่งผู้อำนวยการโรงเรียน', weight: 'bold', size: 'sm', color: '#ffffff' },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'md',
          contents: [
            { type: 'text', text: c.title.substring(0, 60), size: 'sm', weight: 'bold', wrap: true },
            { type: 'separator', margin: 'sm' },
            { type: 'box', layout: 'vertical', margin: 'sm', spacing: 'xs', contents: [
              { type: 'box', layout: 'horizontal', contents: [
                { type: 'text', text: 'เลขรับ', size: 'xs', color: '#888888', flex: 2 },
                { type: 'text', text: c.registrationNo || '-', size: 'xs', color: '#333333', flex: 3, weight: 'bold' },
              ]},
              { type: 'box', layout: 'horizontal', contents: [
                { type: 'text', text: 'กำหนดส่ง', size: 'xs', color: '#888888', flex: 2 },
                { type: 'text', text: dueLabel, size: 'xs', color: '#333333', flex: 3 },
              ]},
              { type: 'box', layout: 'horizontal', contents: [
                { type: 'text', text: 'ลงนามโดย', size: 'xs', color: '#888888', flex: 2 },
                { type: 'text', text: directorName, size: 'xs', color: '#333333', flex: 3 },
              ]},
            ]},
            { type: 'separator', margin: 'sm' },
            { type: 'text', text: 'คำสั่ง:', size: 'xs', color: '#888888', margin: 'sm' },
            { type: 'text', text: (noteText || 'ทราบ').substring(0, 200), size: 'sm', color: '#1B5E20', wrap: true, weight: 'bold' },
          ],
        },
        footer: {
          type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: 'md',
          contents: [
            {
              type: 'button', style: 'primary', height: 'sm', color: '#1B5E20', flex: 1,
              action: { type: 'message', label: '✓ รับทราบ', text: `รับทราบ #${caseId}` },
            },
            {
              type: 'button', style: 'secondary', height: 'sm', flex: 1,
              action: { type: 'message', label: 'ดูรายละเอียด', text: `ดูเรื่อง #${caseId}` },
            },
          ],
        },
      },
    };

    // Simple text for clerk
    const clerkMessage = this.messaging.buildTextMessage(
      `✅ ผอ. ลงนามเกษียณแล้ว\n\n` +
      `เรื่อง: ${c.title}\n` +
      `เลขรับ: ${c.registrationNo || '-'}\n` +
      `คำสั่ง: ${(noteText || 'ทราบ').substring(0, 80)}\n` +
      `ลงนามโดย: ${directorName}`,
    );

    // Notify all assignees with Flex (director command + action buttons)
    const notified = new Set<string>();
    for (const a of c.assignments) {
      const lineId = a.assignedTo?.lineUser?.lineUserId;
      if (lineId && !notified.has(lineId)) {
        await this.messaging.push(lineId, [assigneeFlexMessage]);
        notified.add(lineId);
      }
    }

    // Notify clerk with simple text
    const clerkLineId = c.registeredBy?.lineUser?.lineUserId;
    if (clerkLineId && !notified.has(clerkLineId)) {
      await this.messaging.push(clerkLineId, [clerkMessage]);
    }
    this.logger.log(`notifyAssigneesDirectorSigned: case #${caseId} notified ${notified.size} assignees + clerk`);
  }

  private async sendLineNotification(lineUserId: string, text: string) {
    try {
      await this.messaging.push(lineUserId, [{ type: 'text', text }]);
    } catch (err) {
      this.logger.warn(`Failed to push LINE to ${lineUserId}: ${err.message}`);
    }
  }

  private async sendLineMessage(lineUserId: string, message: any) {
    try {
      await this.messaging.push(lineUserId, [message]);
    } catch (err) {
      this.logger.warn(`Failed to push LINE message to ${lineUserId}: ${err.message}`);
    }
  }

  /** เตือนเอกสารครบกำหนดเก็บรักษาภายใน 30 วัน */
  async alertRetentionExpiring() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 30);

    const expiring = await this.prisma.documentRegistry.findMany({
      where: {
        retentionEndDate: { lte: cutoff, not: null },
        archivedAt: { not: null },
        registryType: { not: 'destroy' },
      },
      include: { organization: { select: { id: true, name: true } } },
    });

    if (expiring.length === 0) return;

    // Group by org
    const byOrg = new Map<string, typeof expiring>();
    for (const doc of expiring) {
      const orgId = doc.organizationId.toString();
      if (!byOrg.has(orgId)) byOrg.set(orgId, []);
      byOrg.get(orgId)!.push(doc);
    }

    for (const [orgId, docs] of byOrg) {
      const admins = await this.prisma.user.findMany({
        where: {
          organizationId: BigInt(orgId),
          roleCode: { in: ['ADMIN', 'DIRECTOR'] },
          isActive: true,
          lineUserRef: { not: null },
        },
        include: { lineUser: { select: { lineUserId: true } } },
      });

      const orgName = docs[0]?.organization?.name ?? 'หน่วยงาน';
      const text = `📋 แจ้งเตือน: มีเอกสาร ${docs.length} รายการ ของ${orgName} จะครบกำหนดเก็บรักษาภายใน 30 วัน กรุณาตรวจสอบและดำเนินการทำลายหรือขอเก็บต่อ`;

      for (const admin of admins) {
        const lineUserId = (admin as any).lineUser?.lineUserId;
        if (lineUserId) {
          await this.sendLineNotification(lineUserId, text);
        }
      }
    }

    this.logger.log(`Retention alert sent for ${expiring.length} documents`);
  }
}
