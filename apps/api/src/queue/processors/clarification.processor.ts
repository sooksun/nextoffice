import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_AI_PROCESSING } from '../queue.constants';

@Processor(QUEUE_AI_PROCESSING)
export class ClarificationProcessor {
  private readonly logger = new Logger(ClarificationProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('ai.nonofficial.clarify')
  async handleClarify(job: Job<{ documentIntakeId: string }>) {
    const intakeId = BigInt(job.data.documentIntakeId);
    this.logger.log(`Non-official clarify for intake ${intakeId}`);

    await this.prisma.documentIntake.update({
      where: { id: intakeId },
      data: { aiStatus: 'awaiting_user_intent' },
    });
  }

  @Process('line.session.handle-action')
  async handleSessionAction(job: Job<{ sessionId: string; actionCode: string }>) {
    this.logger.log(`Handle session action: ${job.data.actionCode} session ${job.data.sessionId}`);
  }
}
