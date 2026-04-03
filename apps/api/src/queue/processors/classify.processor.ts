import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_AI_PROCESSING } from '../queue.constants';

@Processor(QUEUE_AI_PROCESSING)
export class ClassifyProcessor {
  private readonly logger = new Logger(ClassifyProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('ai.classify.document')
  async handleClassify(job: Job<{ documentIntakeId: string }>) {
    const intakeId = BigInt(job.data.documentIntakeId);
    this.logger.log(`Classify document for intake ${intakeId}`);

    await this.prisma.documentIntake.update({
      where: { id: intakeId },
      data: { classifierStatus: 'processing' },
    });

    // Classification handled by ClassifierService
    // Pipeline will update classifierStatus to 'done' after AI call
    await this.prisma.documentIntake.update({
      where: { id: intakeId },
      data: { classifierStatus: 'done' },
    });
  }
}
