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
}
