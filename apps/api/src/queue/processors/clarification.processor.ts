import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { NonOfficialWorkflowService } from '../../ai/services/non-official-workflow.service';
import { QUEUE_AI_PROCESSING } from '../queue.constants';

@Processor(QUEUE_AI_PROCESSING)
export class ClarificationProcessor {
  private readonly logger = new Logger(ClarificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nonOfficialWorkflow: NonOfficialWorkflowService,
  ) {}

  @Process('ai.nonofficial.clarify')
  async handleClarify(job: Job<{ documentIntakeId: string }>) {
    const intakeId = BigInt(job.data.documentIntakeId);
    this.logger.log(`Non-official clarify for intake ${intakeId}`);

    try {
      await this.nonOfficialWorkflow.openClarificationSession(intakeId);
    } catch (err) {
      this.logger.error(`Non-official workflow failed: ${err.message}`);
      await this.prisma.documentIntake.update({
        where: { id: intakeId },
        data: { aiStatus: 'failed' },
      });
    }
  }

  @Process('line.session.handle-action')
  async handleSessionAction(job: Job<{ sessionId: string; actionCode: string }>) {
    const sessionId = BigInt(job.data.sessionId);
    this.logger.log(`Handle session action: ${job.data.actionCode} session ${sessionId}`);

    try {
      await this.nonOfficialWorkflow.handleUserSelectedAction(sessionId, job.data.actionCode);
    } catch (err) {
      this.logger.error(`Session action failed: ${err.message}`);
    }
  }
}
