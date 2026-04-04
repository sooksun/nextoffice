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
    this.logger.log(`OCR extract job for intake ${intakeId} — OCR is handled inline by IntakeProcessor`);
    // OCR is now performed directly in IntakeProcessor (which has the file buffer).
    // This processor exists only as a queue handler placeholder.
  }
}
