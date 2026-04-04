import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { OfficialWorkflowService } from '../../ai/services/official-workflow.service';
import { LineSessionService } from '../../line/services/line-session.service';
import { QUEUE_AI_PROCESSING } from '../queue.constants';

@Processor(QUEUE_AI_PROCESSING)
export class OfficialProcessor {
  private readonly logger = new Logger(OfficialProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly officialWorkflow: OfficialWorkflowService,
    private readonly sessionSvc: LineSessionService,
  ) {}

  @Process('ai.official.process')
  async handleOfficialProcess(job: Job<{ documentIntakeId: string }>) {
    const intakeId = BigInt(job.data.documentIntakeId);
    this.logger.log(`Official process for intake ${intakeId}`);

    await this.prisma.documentIntake.update({
      where: { id: intakeId },
      data: { aiStatus: 'analyzing' },
    });

    try {
      await this.officialWorkflow.process(intakeId);

      // Open a conversation session so the user can do follow-up actions
      const intake = await this.prisma.documentIntake.findUnique({
        where: { id: intakeId },
      });
      if (intake?.lineUserIdRef) {
        await this.sessionSvc.openSession(intake.lineUserIdRef, intakeId, 'official_followup');
        this.logger.log(`Opened session for user ${intake.lineUserIdRef} on intake ${intakeId}`);
      }
    } catch (err) {
      this.logger.error(`Official workflow failed: ${err.message}`);
      await this.prisma.documentIntake.update({
        where: { id: intakeId },
        data: { aiStatus: 'failed' },
      });
    }
  }
}
