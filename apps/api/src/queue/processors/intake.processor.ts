import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentFetchService } from '../../intake/services/content-fetch.service';
import { FileStorageService } from '../../intake/services/file-storage.service';
import { OcrService } from '../../ai/services/ocr.service';
import { QueueDispatcherService } from '../services/queue-dispatcher.service';
import { QUEUE_LINE_EVENTS } from '../queue.constants';

@Processor(QUEUE_LINE_EVENTS)
export class IntakeProcessor {
  private readonly logger = new Logger(IntakeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentFetch: ContentFetchService,
    private readonly fileStorage: FileStorageService,
    private readonly ocrService: OcrService,
    private readonly dispatcher: QueueDispatcherService,
  ) {}

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
    const messageId = payload.message?.id;

    if (!['image', 'file'].includes(messageType) || !messageId) {
      this.logger.log(`Event ${eventId} is type=${event.eventType} msg=${messageType} — skipped`);
      return;
    }

    // Resolve LINE user
    const lineUser = await this.prisma.lineUser.findUnique({
      where: { lineUserId: event.lineUserId },
    });

    // Determine mime type and extension
    let mimeType = messageType === 'image' ? 'image/jpeg' : 'application/octet-stream';
    let fileExtension = messageType === 'image' ? 'jpg' : null;
    const fileName = payload.message?.fileName;
    if (fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      fileExtension = ext || null;
      if (ext === 'pdf') mimeType = 'application/pdf';
      else if (ext === 'png') mimeType = 'image/png';
    }

    // Create document intake record
    const intake = await this.prisma.documentIntake.create({
      data: {
        sourceChannel: 'line_chat',
        lineEventId: eventId,
        lineUserIdRef: lineUser?.id || null,
        organizationId: lineUser?.organizationId || null,
        mimeType,
        fileExtension,
        originalFileName: fileName || `line_${messageId}.${fileExtension || 'bin'}`,
        uploadStatus: 'received',
        ocrStatus: 'pending',
        classifierStatus: 'pending',
        aiStatus: 'pending',
      },
    });

    this.logger.log(`Created DocumentIntake #${intake.id}`);

    // Download file content from LINE
    let buffer: Buffer;
    try {
      const result = await this.contentFetch.fetchMessageContent(messageId);
      buffer = result.buffer;
      const detectedMime = this.contentFetch.detectMimeType(buffer);
      if (detectedMime !== 'application/octet-stream') {
        mimeType = detectedMime;
        await this.prisma.documentIntake.update({
          where: { id: intake.id },
          data: { mimeType: detectedMime },
        });
      }
    } catch (fetchErr) {
      this.logger.error(`Failed to fetch content from LINE: ${fetchErr.message}`);
      await this.prisma.documentIntake.update({
        where: { id: intake.id },
        data: { uploadStatus: 'fetch_failed', ocrStatus: 'failed' },
      });
      return;
    }

    // Store file in MinIO (non-blocking — continue even if storage fails)
    try {
      const storagePath = this.fileStorage.buildStoragePath('line_chat', mimeType, intake.id.toString());
      await this.fileStorage.saveBuffer(storagePath, buffer, mimeType);
      await this.prisma.documentIntake.update({
        where: { id: intake.id },
        data: {
          storagePath,
          uploadStatus: 'stored',
          fileSize: BigInt(buffer.length),
          sha256: this.fileStorage.computeSha256(buffer),
        },
      });
      this.logger.log(`File stored at: ${storagePath}`);
    } catch (storageErr) {
      this.logger.warn(`File storage failed (continuing with OCR): ${storageErr.message}`);
      await this.prisma.documentIntake.update({
        where: { id: intake.id },
        data: { uploadStatus: 'storage_failed' },
      });
    }

    // Run OCR directly (instead of separate queue step, to avoid buffer serialization)
    try {
      await this.prisma.documentIntake.update({
        where: { id: intake.id },
        data: { ocrStatus: 'processing' },
      });

      const extractedText = await this.ocrService.extractText(buffer, mimeType);
      this.logger.log(`OCR extracted ${extractedText.length} chars for intake ${intake.id}`);

      // Create DocumentAiResult with extracted text
      await this.prisma.documentAiResult.create({
        data: {
          documentIntakeId: intake.id,
          extractedText,
        },
      });

      await this.prisma.documentIntake.update({
        where: { id: intake.id },
        data: { ocrStatus: 'done' },
      });
    } catch (ocrErr) {
      this.logger.error(`OCR failed: ${ocrErr.message}`);
      await this.prisma.documentIntake.update({
        where: { id: intake.id },
        data: { ocrStatus: 'failed' },
      });
      return;
    }

    // Update event status
    await this.prisma.lineEvent.update({
      where: { id: eventId },
      data: { receiveStatus: 'queued', processedAt: new Date() },
    });

    // Dispatch classification
    await this.dispatcher.dispatchClassify(intake.id);
    this.logger.log(`Dispatched classify for intake ${intake.id}`);
  }
}
