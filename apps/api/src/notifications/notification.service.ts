import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LineMessagingService } from '../line/services/line-messaging.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: LineMessagingService,
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
                        c.urgencyLevel === 'very_urgent' ? '⚡ ด่วนมาก' :
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
                        c.urgencyLevel === 'very_urgent' ? '⚡ ด่วนมาก' :
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
}
