import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LineSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async openSession(lineUserIdRef: bigint, documentIntakeId: bigint, sessionType: string) {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    return this.prisma.lineConversationSession.create({
      data: {
        lineUserIdRef,
        documentIntakeId,
        sessionType,
        currentStep: 'awaiting_user_intent',
        status: 'open',
        expiresAt,
      },
    });
  }

  async getActiveSession(lineUserIdRef: bigint) {
    return this.prisma.lineConversationSession.findFirst({
      where: {
        lineUserIdRef,
        status: 'open',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recordAction(sessionId: bigint, actionCode: string, actionLabel: string, payloadJson?: any) {
    return this.prisma.lineSessionAction.create({
      data: {
        sessionId,
        actionCode,
        actionLabel,
        payloadJson: payloadJson ? JSON.stringify(payloadJson) : null,
      },
    });
  }

  async closeSession(sessionId: bigint) {
    await this.prisma.lineConversationSession.update({
      where: { id: sessionId },
      data: { status: 'completed' },
    });
  }
}
