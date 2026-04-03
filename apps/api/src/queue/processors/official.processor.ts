import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_AI_PROCESSING } from '../queue.constants';

@Processor(QUEUE_AI_PROCESSING)
export class OfficialProcessor {
  private readonly logger = new Logger(OfficialProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('ai.official.process')
  async handleOfficialProcess(job: Job<{ documentIntakeId: string }>) {
    const intakeId = BigInt(job.data.documentIntakeId);
    this.logger.log(`Official process for intake ${intakeId}`);

    await this.prisma.documentIntake.update({
      where: { id: intakeId },
      data: { aiStatus: 'analyzing' },
    });
    // Full processing handled by OfficialWorkflowService
  }
}
