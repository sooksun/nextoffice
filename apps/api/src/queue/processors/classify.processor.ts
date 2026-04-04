import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassifierService } from '../../ai/services/classifier.service';
import { QueueDispatcherService } from '../services/queue-dispatcher.service';
import { QUEUE_AI_PROCESSING } from '../queue.constants';

@Processor(QUEUE_AI_PROCESSING)
export class ClassifyProcessor {
  private readonly logger = new Logger(ClassifyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classifier: ClassifierService,
    private readonly dispatcher: QueueDispatcherService,
  ) {}

  @Process('ai.classify.document')
  async handleClassify(job: Job<{ documentIntakeId: string }>) {
    const intakeId = BigInt(job.data.documentIntakeId);
    this.logger.log(`Classify document for intake ${intakeId}`);

    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: intakeId },
      include: { aiResult: true },
    });
    if (!intake || !intake.aiResult) {
      this.logger.warn(`Intake ${intakeId} or AI result not found`);
      return;
    }

    await this.prisma.documentIntake.update({
      where: { id: intakeId },
      data: { classifierStatus: 'processing' },
    });

    const extractedText = intake.aiResult.extractedText || '';

    try {
      const result = await this.classifier.classifyDocument(extractedText, {
        mimeType: intake.mimeType,
        originalFileName: intake.originalFileName || undefined,
      });

      // Update AI result with classification
      await this.prisma.documentAiResult.update({
        where: { id: intake.aiResult.id },
        data: {
          isOfficialDocument: result.isOfficialDocument,
          classificationLabel: result.classificationLabel,
          classificationConfidence: result.classificationConfidence,
        },
      });

      await this.prisma.documentIntake.update({
        where: { id: intakeId },
        data: { classifierStatus: 'done' },
      });

      this.logger.log(
        `Classified intake ${intakeId}: ${result.classificationLabel} (${result.classificationConfidence})`,
      );

      // Route based on classification
      if (result.isOfficialDocument) {
        await this.dispatcher.dispatchOfficialProcess(intakeId);
        this.logger.log(`Dispatched official process for intake ${intakeId}`);
      } else {
        await this.dispatcher.dispatchNonOfficialClarify(intakeId);
        this.logger.log(`Dispatched non-official clarify for intake ${intakeId}`);
      }
    } catch (err) {
      this.logger.error(`Classification failed: ${err.message}`);
      await this.prisma.documentIntake.update({
        where: { id: intakeId },
        data: { classifierStatus: 'failed' },
      });
    }
  }
}
