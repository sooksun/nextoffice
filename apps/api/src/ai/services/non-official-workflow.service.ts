import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LineMessagingService } from '../../line/services/line-messaging.service';
import { LineSessionService } from '../../line/services/line-session.service';

@Injectable()
export class NonOfficialWorkflowService {
  private readonly logger = new Logger(NonOfficialWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: LineMessagingService,
    private readonly sessionSvc: LineSessionService,
  ) {}

  async openClarificationSession(documentIntakeId: bigint): Promise<void> {
    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: documentIntakeId },
      include: { lineEvent: true },
    });
    if (!intake) return;

    const lineUser = intake.lineUserIdRef
      ? await this.prisma.lineUser.findUnique({ where: { id: intake.lineUserIdRef } })
      : null;

    if (lineUser) {
      await this.sessionSvc.openSession(lineUser.id, documentIntakeId, 'clarification');
    }

    await this.prisma.documentIntake.update({
      where: { id: documentIntakeId },
      data: { aiStatus: 'awaiting_user_intent' },
    });

    // Reply to LINE user with quick choices
    if (intake.lineEvent) {
      const payload = JSON.parse(intake.lineEvent.rawPayloadJson);
      const replyToken = payload.replyToken;
      if (replyToken) {
        const messages = this.messaging.buildNonOfficialDocumentReply();
        await this.messaging.reply(replyToken, messages);
      }
    }

    this.logger.log(`Non-official clarification session opened for intake ${documentIntakeId}`);
  }

  async handleUserSelectedAction(sessionId: bigint, actionCode: string): Promise<void> {
    const session = await this.prisma.lineConversationSession.findUnique({
      where: { id: sessionId },
      include: { documentIntake: true, lineUser: true },
    });
    if (!session || !session.documentIntake) return;

    await this.sessionSvc.recordAction(sessionId, actionCode, actionCode);

    const actionMap: Record<string, string> = {
      summarize: 'สรุปเอกสาร',
      translate: 'แปลเอกสาร',
      extract_key: 'ดึงสาระสำคัญ',
      draft_reply: 'ร่างข้อความตอบ',
      archive_only: 'เก็บเป็นเอกสารอ้างอิง',
    };

    const label = actionMap[actionCode] || actionCode;
    this.logger.log(`User selected action: ${label} for session ${sessionId}`);

    await this.prisma.documentIntake.update({
      where: { id: session.documentIntake.id },
      data: { aiStatus: 'completed' },
    });
    await this.sessionSvc.closeSession(sessionId);
  }
}
