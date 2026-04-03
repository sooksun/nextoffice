import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_LINE_EVENTS } from '../queue.constants';

@Processor(QUEUE_LINE_EVENTS)
export class IntakeProcessor {
  private readonly logger = new Logger(IntakeProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('line.intake.received')
  async handleLineIntakeReceived(job: Job<{ lineEventId: string }>) {
    const eventId = BigInt(job.data.lineEventId);
    this.logger.log(`Processing line.intake.received for event ${eventId}`);

    const event = await this.prisma.lineEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      this.logger.warn(`Event ${eventId} not found`);
      return;
    }

    const payload = JSON.parse(event.rawPayloadJson);
    const messageType = payload.message?.type;

    if (!['image', 'file'].includes(messageType)) {
      this.logger.log(`Event ${eventId} is type=${event.eventType} msg=${messageType} — skipped`);
      return;
    }

    // Create document intake record
    const lineUser = await this.prisma.lineUser.findUnique({
      where: { lineUserId: event.lineUserId },
    });

    const intake = await this.prisma.documentIntake.create({
      data: {
        sourceChannel: 'line_chat',
        lineEventId: eventId,
        lineUserIdRef: lineUser?.id || null,
        organizationId: lineUser?.organizationId || null,
        mimeType: messageType === 'image' ? 'image/jpeg' : 'application/octet-stream',
        fileExtension: messageType === 'image' ? 'jpg' : null,
        uploadStatus: 'received',
        ocrStatus: 'pending',
        classifierStatus: 'pending',
        aiStatus: 'pending',
      },
    });

    this.logger.log(`Created DocumentIntake #${intake.id}`);

    // Update event status
    await this.prisma.lineEvent.update({
      where: { id: eventId },
      data: { receiveStatus: 'queued', processedAt: new Date() },
    });
  }
}
