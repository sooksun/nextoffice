import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LineMessagingService } from './line-messaging.service';

@Injectable()
export class LineAttendanceService {
  private readonly logger = new Logger(LineAttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: LineMessagingService,
    private readonly config: ConfigService,
  ) {}

  // ─── ลงเวลา — send web link ────────────────────────

  async handleCheckInPrompt(lineUserId: string, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const webUrl = this.config.get('WEB_URL', 'https://nextoffice.cnppai.com');

    await this.messaging.reply(replyToken, [
      this.messaging.buildQuickReply(
        '🕐 ลงเวลาปฏิบัติราชการ\n\nกรุณาเปิดหน้าเว็บเพื่อสแกนใบหน้า:',
        [
          { label: '📸 ลงเวลาเข้า', text: 'สถานะลงเวลา' },
          { label: '📋 งานของฉัน', text: 'งานของฉัน' },
        ],
      ),
      this.messaging.buildTextMessage(
        `🔗 ลงเวลาเข้า: ${webUrl}/attendance/check-in?mode=in\n` +
        `🔗 ลงเวลาออก: ${webUrl}/attendance/check-in?mode=out`,
      ),
    ]);
  }

  // ─── สถานะลงเวลาวันนี้ ─────────────────────────────

  async handleAttendanceStatus(lineUserId: string, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await this.prisma.attendanceRecord.findUnique({
      where: { userId_attendanceDate: { userId: user.id, attendanceDate: today } },
    });

    const STATUS_LABEL = {
      checked_in: '✅ ลงเวลาเข้าแล้ว',
      checked_out: '✅ ลงเวลาออกแล้ว',
      late: '⚠️ มาสาย',
      leave: '📝 ลา',
      travel: '🚗 ไปราชการ',
      absent: '❌ ขาด',
    };

    if (!record) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildQuickReply(
          `🕐 สถานะวันนี้: ยังไม่ได้ลงเวลา\n\nกรุณาลงเวลาผ่านหน้าเว็บ`,
          [
            { label: '📸 ลงเวลา', text: 'ลงเวลา' },
            { label: '📋 ขอลา', text: 'ขอลา' },
          ],
        ),
      ]);
      return;
    }

    const statusLabel = STATUS_LABEL[record.status] || record.status;
    const checkIn = record.checkInAt ? record.checkInAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-';
    const checkOut = record.checkOutAt ? record.checkOutAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-';
    const geoNote = record.geofenceValid ? '' : '\n⚠️ ตำแหน่งนอกเขตโรงเรียน';

    await this.messaging.reply(replyToken, [
      this.messaging.buildTextMessage(
        `🕐 สถานะลงเวลาวันนี้\n\n` +
        `${statusLabel}\n` +
        `⏰ เข้า: ${checkIn}\n` +
        `⏰ ออก: ${checkOut}${geoNote}`,
      ),
    ]);
  }

  // ─── สถานะการลา ─────────────────────────────────────

  async handleLeaveStatus(lineUserId: string, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const recentLeaves = await this.prisma.leaveRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Get balance
    const currentYear = await this.prisma.academicYear.findFirst({ where: { isCurrent: true } });
    const balances = currentYear
      ? await this.prisma.leaveBalance.findMany({
          where: { userId: user.id, academicYearId: currentYear.id },
        })
      : [];

    const TYPE_LABEL = { sick: 'ลาป่วย', personal: 'ลากิจ', vacation: 'ลาพักผ่อน' };
    const STATUS_LABEL = { draft: 'ร่าง', pending: 'รออนุมัติ', approved: 'อนุมัติ', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิก' };

    let balanceText = '';
    if (balances.length > 0) {
      balanceText = '\n📊 วันลาคงเหลือ:\n' +
        balances.map((b) => {
          const label = TYPE_LABEL[b.leaveType] || b.leaveType;
          const remaining = Number(b.totalAllowed) - Number(b.totalUsed);
          return `  ${label}: ${remaining} วัน (ใช้แล้ว ${Number(b.totalUsed)}/${Number(b.totalAllowed)})`;
        }).join('\n');
    }

    let recentText = '';
    if (recentLeaves.length > 0) {
      recentText = '\n\n📋 ใบลาล่าสุด:\n' +
        recentLeaves.map((l) => {
          const type = TYPE_LABEL[l.leaveType] || l.leaveType;
          const status = STATUS_LABEL[l.status] || l.status;
          const start = l.startDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
          const end = l.endDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
          return `  • ${type} ${start}-${end} (${status})`;
        }).join('\n');
    }

    const webUrl = this.config.get('WEB_URL', 'https://nextoffice.cnppai.com');

    await this.messaging.reply(replyToken, [
      this.messaging.buildTextMessage(`📝 สถานะการลา${balanceText}${recentText}`),
      this.messaging.buildQuickReply('ต้องการดำเนินการอะไร?', [
        { label: '📝 ส่งใบลา', text: 'ขอลา' },
        { label: '🚗 ไปราชการ', text: 'ขอไปราชการ' },
        { label: '🕐 ลงเวลา', text: 'สถานะลงเวลา' },
      ]),
    ]);
  }

  // ─── ขอลา — send web link ───────────────────────────

  async handleLeavePrompt(lineUserId: string, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const webUrl = this.config.get('WEB_URL', 'https://nextoffice.cnppai.com');

    await this.messaging.reply(replyToken, [
      this.messaging.buildTextMessage(
        `📝 ส่งใบลา\n\n` +
        `กรุณาเปิดหน้าเว็บเพื่อกรอกแบบฟอร์ม:\n` +
        `🔗 ${webUrl}/leave/new`,
      ),
      this.messaging.buildQuickReply('หรือเลือกดูข้อมูล:', [
        { label: '📊 สถานะการลา', text: 'สถานะการลา' },
        { label: '🕐 สถานะลงเวลา', text: 'สถานะลงเวลา' },
      ]),
    ]);
  }

  // ─── ขอไปราชการ — send web link ─────────────────────

  async handleTravelPrompt(lineUserId: string, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    const webUrl = this.config.get('WEB_URL', 'https://nextoffice.cnppai.com');

    await this.messaging.reply(replyToken, [
      this.messaging.buildTextMessage(
        `🚗 ขออนุญาตไปราชการ\n\n` +
        `กรุณาเปิดหน้าเว็บเพื่อกรอกแบบฟอร์ม:\n` +
        `🔗 ${webUrl}/leave/travel/new`,
      ),
    ]);
  }

  // ─── Push notifications for approval workflow ───────

  async notifyLeaveSubmitted(leaveRequestId: number): Promise<void> {
    const req = await this.prisma.leaveRequest.findUnique({
      where: { id: BigInt(leaveRequestId) },
      include: {
        user: true,
        currentApprover: { include: { lineUser: true } },
      },
    });
    if (!req?.currentApprover?.lineUser) return;

    const TYPE_LABEL = { sick: 'ลาป่วย', personal: 'ลากิจ', vacation: 'ลาพักผ่อน' };
    const type = TYPE_LABEL[req.leaveType] || req.leaveType;
    const start = req.startDate.toLocaleDateString('th-TH');
    const end = req.endDate.toLocaleDateString('th-TH');

    await this.messaging.push(req.currentApprover.lineUser.lineUserId, [
      this.messaging.buildTextMessage(
        `📝 ใบลาใหม่รออนุมัติ\n\n` +
        `👤 ${req.user.fullName}\n` +
        `📋 ${type}\n` +
        `📅 ${start} - ${end} (${Number(req.totalDays)} วัน)\n` +
        `💬 ${req.reason || '-'}`,
      ),
      this.messaging.buildQuickReply('ดำเนินการ:', [
        { label: '✅ อนุมัติ', text: `อนุมัติลา #${Number(req.id)}` },
        { label: '❌ ไม่อนุมัติ', text: `ไม่อนุมัติลา #${Number(req.id)}` },
      ]),
    ]);
  }

  async notifyLeaveApproved(leaveRequestId: number): Promise<void> {
    const req = await this.prisma.leaveRequest.findUnique({
      where: { id: BigInt(leaveRequestId) },
      include: { user: { include: { lineUser: true } } },
    });
    if (!req?.user?.lineUser) return;

    const TYPE_LABEL = { sick: 'ลาป่วย', personal: 'ลากิจ', vacation: 'ลาพักผ่อน' };
    const type = TYPE_LABEL[req.leaveType] || req.leaveType;

    await this.messaging.push(req.user.lineUser.lineUserId, [
      this.messaging.buildTextMessage(
        `✅ ใบลาได้รับอนุมัติ\n\n` +
        `📋 ${type}\n` +
        `📅 ${req.startDate.toLocaleDateString('th-TH')} - ${req.endDate.toLocaleDateString('th-TH')}\n` +
        `📝 ${Number(req.totalDays)} วัน`,
      ),
    ]);
  }

  async notifyLeaveRejected(leaveRequestId: number): Promise<void> {
    const req = await this.prisma.leaveRequest.findUnique({
      where: { id: BigInt(leaveRequestId) },
      include: { user: { include: { lineUser: true } } },
    });
    if (!req?.user?.lineUser) return;

    await this.messaging.push(req.user.lineUser.lineUserId, [
      this.messaging.buildTextMessage(
        `❌ ใบลาไม่ได้รับอนุมัติ\n\n` +
        `📋 ${req.leaveType}\n` +
        `💬 เหตุผล: ${req.rejectedReason || '-'}`,
      ),
    ]);
  }

  // ─── Helpers ────────────────────────────────────────

  private async findLinkedUser(lineUserId: string) {
    const lineUser = await this.prisma.lineUser.findUnique({
      where: { lineUserId },
      include: { user: true },
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
