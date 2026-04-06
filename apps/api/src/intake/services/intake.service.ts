import { Injectable, NotFoundException, BadRequestException, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from './file-storage.service';
import { GoogleDriveService } from './google-drive.service';
import { QueueDispatcherService } from '../../queue/services/queue-dispatcher.service';
import { OcrService } from '../../ai/services/ocr.service';
import { ClassifierService } from '../../ai/services/classifier.service';
import { ExtractionService } from '../../ai/services/extraction.service';

@Injectable()
export class IntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly drive: GoogleDriveService,
    private readonly dispatcher: QueueDispatcherService,
    @Optional() private readonly ocrService: OcrService,
    @Optional() private readonly classifier: ClassifierService,
    @Optional() private readonly extraction: ExtractionService,
  ) {}

  async createFromUpload(
    file: Express.Multer.File,
    organizationId?: number,
    sourceChannel = 'liff_upload',
  ) {
    const mimeType = file.mimetype || this.storage.computeSha256(file.buffer);
    const sha256 = this.storage.computeSha256(file.buffer);

    // Create intake record
    const intake = await this.prisma.documentIntake.create({
      data: {
        sourceChannel,
        organizationId: organizationId ? BigInt(organizationId) : null,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileExtension: file.originalname?.split('.').pop() || null,
        fileSize: BigInt(file.size),
        sha256,
        uploadStatus: 'received',
        ocrStatus: 'pending',
        classifierStatus: 'pending',
        aiStatus: 'pending',
      },
    });

    // Save to MinIO
    const storagePath = this.storage.buildStoragePath(
      sourceChannel,
      file.mimetype,
      intake.id.toString(),
    );
    await this.storage.saveBuffer(storagePath, file.buffer, file.mimetype);
    await this.prisma.documentIntake.update({
      where: { id: intake.id },
      data: { storagePath, uploadStatus: 'stored' },
    });

    // Queue OCR and classify
    await this.dispatcher.dispatchOcr(intake.id);
    await this.dispatcher.dispatchDriveBackup(intake.id);

    return { documentIntakeId: Number(intake.id), status: 'received' };
  }

  /**
   * Synchronous web upload: OCR → Classify → Extract in one request.
   * Returns full AI analysis result immediately.
   */
  async webUploadAndAnalyze(
    file: Express.Multer.File,
    organizationId?: number,
    userId?: number,
  ) {
    const ALLOWED_MIMES = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/jpg',
      'image/png',
    ];
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException('รองรับเฉพาะไฟล์ PDF, DOCX, JPG, JPEG, PNG เท่านั้น');
    }
    if (!this.ocrService || !this.classifier || !this.extraction) {
      throw new BadRequestException('AI services are not available');
    }

    const sha256 = this.storage.computeSha256(file.buffer);

    // 1. Create intake record
    const intake = await this.prisma.documentIntake.create({
      data: {
        sourceChannel: 'web_upload',
        organizationId: organizationId ? BigInt(organizationId) : null,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileExtension: file.originalname?.split('.').pop() || null,
        fileSize: BigInt(file.size),
        sha256,
        uploadStatus: 'received',
        ocrStatus: 'pending',
        classifierStatus: 'pending',
        aiStatus: 'pending',
      },
    });

    // 2. Store file in MinIO (non-blocking — continue even if storage fails)
    try {
      const storagePath = this.storage.buildStoragePath('web_upload', file.mimetype, intake.id.toString());
      await this.storage.saveBuffer(storagePath, file.buffer, file.mimetype);
      await this.prisma.documentIntake.update({
        where: { id: intake.id },
        data: { storagePath, uploadStatus: 'stored' },
      });
    } catch (storageErr) {
      await this.prisma.documentIntake.update({
        where: { id: intake.id },
        data: { uploadStatus: 'storage_failed' },
      });
    }

    // 3. OCR - extract text
    await this.prisma.documentIntake.update({
      where: { id: intake.id },
      data: { ocrStatus: 'processing' },
    });

    let extractedText = '';
    try {
      extractedText = await this.ocrService.extractText(file.buffer, file.mimetype);
      await this.prisma.documentIntake.update({
        where: { id: intake.id },
        data: { ocrStatus: 'done' },
      });
    } catch (ocrErr) {
      await this.prisma.documentIntake.update({
        where: { id: intake.id },
        data: { ocrStatus: 'failed' },
      });
      throw new BadRequestException('ไม่สามารถอ่านข้อมูลจากไฟล์ได้ กรุณาลองใหม่');
    }

    // 4. Classify document
    await this.prisma.documentIntake.update({
      where: { id: intake.id },
      data: { classifierStatus: 'processing' },
    });

    const classResult = await this.classifier.classifyDocument(extractedText, {
      mimeType: file.mimetype,
      originalFileName: file.originalname || undefined,
    });

    // 5. Extract metadata if official
    let metadata = null;
    if (classResult.isOfficialDocument) {
      metadata = await this.extraction.extractOfficialMetadata(extractedText);
    }

    // 6. Save AI result
    const aiResult = await this.prisma.documentAiResult.create({
      data: {
        documentIntakeId: intake.id,
        extractedText,
        isOfficialDocument: classResult.isOfficialDocument,
        classificationLabel: classResult.classificationLabel,
        classificationConfidence: classResult.classificationConfidence,
        documentNo: metadata?.documentNo || null,
        documentDate: metadata?.documentDate ? new Date(metadata.documentDate) : null,
        subjectText: metadata?.subjectText || null,
        summaryText: metadata?.summary || null,
        deadlineDate: metadata?.deadlineDate ? new Date(metadata.deadlineDate) : null,
        isMeeting: metadata?.isMeeting || false,
        meetingDate: metadata?.meetingDate ? new Date(metadata.meetingDate) : null,
        meetingTime: metadata?.meetingTime || null,
        meetingLocation: metadata?.meetingLocation || null,
        nextActionJson: metadata?.actions ? JSON.stringify(metadata.actions) : null,
      },
    });

    await this.prisma.documentIntake.update({
      where: { id: intake.id },
      data: {
        classifierStatus: 'done',
        aiStatus: 'done',
      },
    });

    // 7. Backup to Drive (non-blocking)
    this.dispatcher.dispatchDriveBackup(intake.id).catch(() => {});

    return {
      documentIntakeId: Number(intake.id),
      isOfficialDocument: classResult.isOfficialDocument,
      classificationLabel: classResult.classificationLabel,
      confidence: classResult.classificationConfidence,
      documentSubtype: classResult.documentSubtype || null,
      reasoningSummary: classResult.reasoningSummary || null,
      metadata: metadata ? {
        issuingAuthority: metadata.issuingAuthority,
        documentNo: metadata.documentNo,
        documentDate: metadata.documentDate,
        subjectText: metadata.subjectText,
        deadlineDate: metadata.deadlineDate,
        summary: metadata.summary,
        intent: metadata.intent,
        urgency: metadata.urgency,
        actions: metadata.actions,
        isMeeting: metadata.isMeeting,
        meetingDate: metadata.meetingDate,
        meetingTime: metadata.meetingTime,
        meetingLocation: metadata.meetingLocation,
      } : null,
      extractedTextPreview: extractedText.substring(0, 500),
    };
  }

  async findById(id: number) {
    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: BigInt(id) },
      include: { aiResult: true },
    });
    if (!intake) throw new NotFoundException(`DocumentIntake #${id} not found`);
    return this.serialize(intake);
  }

  async getResult(id: number) {
    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: BigInt(id) },
      include: { aiResult: true },
    });
    if (!intake) throw new NotFoundException(`DocumentIntake #${id} not found`);
    const result = intake.aiResult;
    if (!result) return { documentIntakeId: id, status: intake.aiStatus, result: null };

    return {
      documentIntakeId: id,
      classificationLabel: result.classificationLabel,
      confidence: result.classificationConfidence,
      summary: result.summaryText,
      nextActions: result.nextActionJson ? JSON.parse(result.nextActionJson) : [],
    };
  }

  async listIntakes(filters: {
    status?: string;
    sourceChannel?: string;
    classificationLabel?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20 } = filters;
    const where: any = {};
    if (filters.status) where.aiStatus = filters.status;
    if (filters.sourceChannel) where.sourceChannel = filters.sourceChannel;
    if (filters.classificationLabel) {
      where.aiResult = { classificationLabel: filters.classificationLabel };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const [total, items] = await Promise.all([
      this.prisma.documentIntake.count({ where }),
      this.prisma.documentIntake.findMany({
        where,
        include: { aiResult: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      total,
      page,
      limit,
      data: items.map(this.serialize),
    };
  }

  private serialize(intake: any) {
    const result: any = {
      ...intake,
      id: Number(intake.id),
      lineEventId: intake.lineEventId ? Number(intake.lineEventId) : null,
      lineUserIdRef: intake.lineUserIdRef ? Number(intake.lineUserIdRef) : null,
      organizationId: intake.organizationId ? Number(intake.organizationId) : null,
      academicYearId: intake.academicYearId ? Number(intake.academicYearId) : null,
      fileSize: intake.fileSize ? Number(intake.fileSize) : null,
    };
    if (intake.aiResult) {
      result.aiResult = {
        ...intake.aiResult,
        id: Number(intake.aiResult.id),
        documentIntakeId: Number(intake.aiResult.documentIntakeId),
      };
    }
    return result;
  }
}
