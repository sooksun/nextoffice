import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_AI_PROCESSING } from '../queue.constants';

@Processor(QUEUE_AI_PROCESSING)
export class OcrProcessor {
  private readonly logger = new Logger(OcrProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('ai.ocr.extract')
  async handleOcrExtract(job: Job<{ documentIntakeId: string }>) {
    const intakeId = BigInt(job.data.documentIntakeId);
    this.logger.log(`OCR extract for intake ${intakeId}`);

    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: intakeId },
    });
    if (!intake) return;

    await this.prisma.documentIntake.update({
      where: { id: intakeId },
      data: { ocrStatus: 'processing' },
    });

    // OCR is handled by OcrService — mark as done after real extraction
    // For now we mark done so the pipeline continues
    await this.prisma.documentIntake.update({
      where: { id: intakeId },
      data: { ocrStatus: 'done' },
    });
  }
}
