import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PairingService } from '../../auth/services/pairing.service';
import { LineMessagingService } from './line-messaging.service';

@Injectable()
export class LinePairingService {
  private readonly logger = new Logger(LinePairingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pairing: PairingService,
    private readonly messaging: LineMessagingService,
  ) {}

  /**
   * Check if a LINE user is linked to a User account.
   * Returns the linked User or null.
   */
  async getLinkedUser(lineUserId: string) {
    const lineUser = await this.prisma.lineUser.findUnique({
      where: { lineUserId },
    });
    if (!lineUser) return null;

    const user = await this.prisma.user.findFirst({
      where: { lineUserRef: lineUser.id },
    });
    return user;
  }

  /**
   * Auto-pairing flow for unlinked LINE users.
   * - First contact: prompt for email
   * - Email input: match against User.email, auto-link if unique
   * Returns true if the message was handled (caller should not process further).
   */
  async handleAutoLink(
    lineUserId: string,
    text: string,
    replyToken: string,
  ): Promise<boolean> {
    const lineUser = await this.prisma.lineUser.findUnique({
      where: { lineUserId },
    });
    if (!lineUser) return false;

    // Check if already linked
    const existingLink = await this.prisma.user.findFirst({
      where: { lineUserRef: lineUser.id },
    });
    if (existingLink) return false; // already linked, proceed normally

    // Check for active pairing session
    const session = await this.prisma.lineConversationSession.findFirst({
      where: {
        lineUserIdRef: lineUser.id,
        sessionType: 'pairing',
        status: 'open',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      // First contact — create pairing session and prompt for email
      await this.prisma.lineConversationSession.create({
        data: {
          lineUserIdRef: lineUser.id,
          sessionType: 'pairing',
          currentStep: 'awaiting_email',
          status: 'open',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        },
      });

      await this.messaging.reply(replyToken, [
        {
          type: 'text',
          text:
            'สวัสดีครับ! ยินดีต้อนรับสู่ระบบ NextOffice\n\n' +
            'กรุณาพิมพ์อีเมลที่ลงทะเบียนในระบบ เพื่อผูกบัญชี LINE ของคุณ\n\n' +
            'ตัวอย่าง: somchai@school.ac.th',
        },
      ]);
      return true;
    }

    // Session exists — expect email input
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(text.trim())) {
      await this.messaging.reply(replyToken, [
        {
          type: 'text',
          text: 'กรุณาพิมพ์อีเมลให้ถูกต้อง เช่น somchai@school.ac.th',
        },
      ]);
      return true;
    }

    const email = text.trim().toLowerCase();

    // Look up user by email
    const matchedUsers = await this.prisma.user.findMany({
      where: { email, isActive: true },
    });

    if (matchedUsers.length === 0) {
      await this.messaging.reply(replyToken, [
        {
          type: 'text',
          text: 'ไม่พบอีเมลนี้ในระบบ กรุณาตรวจสอบอีเมลแล้วลองใหม่อีกครั้ง\nหรือติดต่อ Admin เพื่อลงทะเบียน',
        },
      ]);
      return true;
    }

    if (matchedUsers.length > 1) {
      await this.messaging.reply(replyToken, [
        {
          type: 'text',
          text: 'พบอีเมลนี้มากกว่า 1 บัญชี กรุณาติดต่อ Admin เพื่อผูกบัญชี',
        },
      ]);
      return true;
    }

    const user = matchedUsers[0];

    // Check if this user is already linked to another LINE account
    if (user.lineUserRef) {
      await this.messaging.reply(replyToken, [
        {
          type: 'text',
          text: 'บัญชีนี้ผูกกับ LINE อื่นอยู่แล้ว กรุณาติดต่อ Admin',
        },
      ]);
      return true;
    }

    // Link: set User.lineUserRef → LineUser.id
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lineUserRef: lineUser.id },
    });

    // Copy org info to LineUser if available
    if (user.organizationId) {
      await this.prisma.lineUser.update({
        where: { id: lineUser.id },
        data: {
          organizationId: user.organizationId,
          roleCode: user.roleCode,
        },
      });
    }

    // Close pairing session
    await this.prisma.lineConversationSession.update({
      where: { id: session.id },
      data: { status: 'completed' },
    });

    this.logger.log(`Auto-paired LINE ${lineUserId} → User #${user.id} (${user.email})`);

    await this.messaging.reply(replyToken, [
      {
        type: 'text',
        text:
          `ผูกบัญชีสำเร็จ!\n\n` +
          `สวัสดีครับ คุณ${user.fullName}\n` +
          `ตำแหน่ง: ${user.positionTitle || user.roleCode}\n` +
          `บัญชี LINE ของคุณเชื่อมกับระบบ NextOffice แล้ว\n\n` +
          `คุณสามารถส่งรูปหนังสือราชการเข้ามาได้เลยครับ`,
      },
    ]);
    return true;
  }

  async handlePairingMessage(
    lineUserId: string,
    code: string,
    replyToken: string,
  ): Promise<void> {
    const lineUser = await this.prisma.lineUser.findUnique({
      where: { lineUserId },
    });
    if (!lineUser) {
      await this.messaging.reply(replyToken, [
        { type: 'text', text: 'ไม่พบบัญชี LINE ในระบบ กรุณาส่งข้อความใดก็ได้ก่อนเพื่อลงทะเบียน' },
      ]);
      return;
    }

    // Check if already linked
    const existingLink = await this.prisma.user.findFirst({
      where: { lineUserRef: lineUser.id },
    });
    if (existingLink) {
      await this.messaging.reply(replyToken, [
        { type: 'text', text: `บัญชี LINE นี้ผูกกับ "${existingLink.fullName}" อยู่แล้ว` },
      ]);
      return;
    }

    try {
      const result = await this.pairing.redeemCode(code, lineUser.id);
      await this.messaging.reply(replyToken, [
        {
          type: 'text',
          text: `ผูกบัญชีสำเร็จ!\nสวัสดีครับ ${result.fullName}\nบัญชี LINE ของคุณเชื่อมกับระบบ NextOffice แล้ว`,
        },
      ]);
    } catch (err) {
      this.logger.warn(`Pairing failed for LINE ${lineUserId}: ${err.message}`);
      await this.messaging.reply(replyToken, [
        { type: 'text', text: err.message || 'เกิดข้อผิดพลาดในการผูกบัญชี' },
      ]);
    }
  }

  async handlePairingHelp(replyToken: string): Promise<void> {
    await this.messaging.reply(replyToken, [
      {
        type: 'text',
        text:
          'วิธีผูกบัญชี LINE กับระบบ NextOffice:\n\n' +
          '1. ขอรหัสผูกบัญชี 6 หลักจาก Admin\n' +
          '2. พิมพ์ "ผูกบัญชี 123456" (เปลี่ยนเป็นรหัสของคุณ)\n\n' +
          'หรือพิมพ์อีเมลที่ลงทะเบียนในระบบ เพื่อผูกบัญชีอัตโนมัติ',
      },
    ]);
  }
}
