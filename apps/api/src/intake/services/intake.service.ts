import { Injectable, Logger, NotFoundException, BadRequestException, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from './file-storage.service';
import { GoogleDriveService } from './google-drive.service';
import { QueueDispatcherService } from '../../queue/services/queue-dispatcher.service';
import { OcrService } from '../../ai/services/ocr.service';
import { ClassifierService } from '../../ai/services/classifier.service';
import { ExtractionService } from '../../ai/services/extraction.service';

@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);

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
    const originalFileNameDecoded = (() => {
      try { return Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch { return file.originalname; }
    })();

    // Create intake record
    const intake = await this.prisma.documentIntake.create({
      data: {
        sourceChannel,
        organizationId: organizationId ? BigInt(organizationId) : null,
        originalFileName: originalFileNameDecoded,
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
   * Store-only upload: save file to MinIO, create intake record, NO AI processing.
   * Used by manual document registration form.
   */
  async storeOnly(
    file: Express.Multer.File,
    organizationId?: number,
  ) {
    const sha256 = this.storage.computeSha256(file.buffer);
    const originalFileName = (() => {
      try { return Buffer.from(file.originalname, 'latin1').toString('utf8'); }
      catch { return file.originalname; }
    })();

    const intake = await this.prisma.documentIntake.create({
      data: {
        sourceChannel: 'manual',
        organizationId: organizationId ? BigInt(organizationId) : null,
        originalFileName,
        mimeType: file.mimetype,
        fileExtension: file.originalname?.split('.').pop() || null,
        fileSize: BigInt(file.size),
        sha256,
        uploadStatus: 'received',
        ocrStatus: 'skipped',
        classifierStatus: 'skipped',
        aiStatus: 'skipped',
      },
    });

    const storagePath = this.storage.buildStoragePath('manual', file.mimetype, intake.id.toString());
    await this.storage.saveBuffer(storagePath, file.buffer, file.mimetype);
    await this.prisma.documentIntake.update({
      where: { id: intake.id },
      data: { storagePath, uploadStatus: 'stored' },
    });

    return {
      id: Number(intake.id),
      originalFileName,
      mimeType: file.mimetype,
    };
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
    // Multer uses Latin-1 for non-ASCII filenames — decode properly to UTF-8
    const originalFileName = (() => {
      try {
        return Buffer.from(file.originalname, 'latin1').toString('utf8');
      } catch {
        return file.originalname;
      }
    })();

    // 1. Create intake record
    const intake = await this.prisma.documentIntake.create({
      data: {
        sourceChannel: 'web_upload',
        organizationId: organizationId ? BigInt(organizationId) : null,
        originalFileName,
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

    // 6. Save AI result — try with meeting fields first, fallback without if columns missing
    let aiResult: any;
    try {
      aiResult = await this.prisma.documentAiResult.create({
        data: {
          documentIntakeId: intake.id,
          extractedText,
          isOfficialDocument: classResult.isOfficialDocument,
          classificationLabel: classResult.classificationLabel,
          classificationConfidence: classResult.classificationConfidence,
          issuingAuthority: metadata?.issuingAuthority || null,
          recipientText: metadata?.recipient || null,
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
          structuredSummaryJson: metadata?.structuredSummary ? JSON.stringify(metadata.structuredSummary) : null,
        },
      });
    } catch (e: any) {
      // Fallback: save without meeting/recipient fields (DB schema not yet migrated)
      if (e?.message?.includes('is_meeting') || e?.message?.includes('meeting') || e?.message?.includes('recipient')) {
        aiResult = await this.prisma.documentAiResult.create({
          data: {
            documentIntakeId: intake.id,
            extractedText,
            isOfficialDocument: classResult.isOfficialDocument,
            classificationLabel: classResult.classificationLabel,
            classificationConfidence: classResult.classificationConfidence,
            issuingAuthority: metadata?.issuingAuthority || null,
            documentNo: metadata?.documentNo || null,
            documentDate: metadata?.documentDate ? new Date(metadata.documentDate) : null,
            subjectText: metadata?.subjectText || null,
            summaryText: metadata?.summary || null,
            deadlineDate: metadata?.deadlineDate ? new Date(metadata.deadlineDate) : null,
            nextActionJson: metadata?.actions ? JSON.stringify(metadata.actions) : null,
            structuredSummaryJson: metadata?.structuredSummary ? JSON.stringify(metadata.structuredSummary) : null,
          },
        });
      } else {
        throw e;
      }
    }

    await this.prisma.documentIntake.update({
      where: { id: intake.id },
      data: {
        classifierStatus: 'done',
        aiStatus: 'done',
      },
    });

    // 7. Auto-create InboundCase for official documents
    let caseId: number | null = null;
    if (classResult.isOfficialDocument) {
      const orgId = intake.organizationId || BigInt(1);
      const intakeRef = `intake:${Number(intake.id)}`;
      const existing = await this.prisma.inboundCase.findFirst({
        where: { description: { contains: intakeRef } },
      });
      if (existing) {
        caseId = Number(existing.id);
      } else {
        const title = metadata?.subjectText || (intake as any).originalFileName || 'เอกสารไม่ระบุชื่อ';
        const urgencyLevel = (() => {
          const u = (metadata?.urgency || '').toLowerCase();
          if (u.includes('ที่สุด') || u === 'most_urgent') return 'most_urgent';
          if (u.includes('มาก') || u === 'very_urgent') return 'very_urgent';
          if (u.includes('ด่วน') || u === 'urgent') return 'urgent';
          return 'normal';
        })();
        // Default due date = today + 3 days when AI cannot extract a deadline from the document
        const fallbackDueDate = (() => {
          const d = new Date();
          d.setHours(23, 59, 59, 999);
          d.setDate(d.getDate() + 3);
          return d;
        })();
        const dueDate = metadata?.deadlineDate ? new Date(metadata.deadlineDate) : fallbackDueDate;
        const newCase = await this.prisma.inboundCase.create({
          data: {
            organizationId: orgId,
            title,
            description: [metadata?.summary || '', intakeRef].filter(Boolean).join('\n'),
            dueDate,
            urgencyLevel,
            status: 'new',
          },
        });
        caseId = Number(newCase.id);
      }
    }

    // 8. Backup to Drive (non-blocking)
    this.dispatcher.dispatchDriveBackup(intake.id).catch(() => {});

    return {
      documentIntakeId: Number(intake.id),
      caseId,
      isOfficialDocument: classResult.isOfficialDocument,
      classificationLabel: classResult.classificationLabel,
      confidence: classResult.classificationConfidence,
      documentSubtype: classResult.documentSubtype || null,
      reasoningSummary: classResult.reasoningSummary || null,
      metadata: metadata ? {
        issuingAuthority: metadata.issuingAuthority,
        recipient: metadata.recipient,
        documentNo: metadata.documentNo,
        documentDate: metadata.documentDate,
        subjectText: metadata.subjectText,
        deadlineDate: metadata.deadlineDate,
        summary: metadata.summary,
        structuredSummary: metadata.structuredSummary,
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

  async findById(id: number, organizationId?: number) {
    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: BigInt(id) },
      include: { aiResult: true },
    });
    if (!intake) throw new NotFoundException(`DocumentIntake #${id} not found`);
    if (organizationId && intake.organizationId && Number(intake.organizationId) !== organizationId) {
      throw new NotFoundException(`DocumentIntake #${id} not found`);
    }
    return this.serialize(intake);
  }

  async getFileBuffer(id: number, organizationId?: number): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const intake = await this.prisma.documentIntake.findUnique({ where: { id: BigInt(id) } });
    if (!intake) throw new NotFoundException(`DocumentIntake #${id} not found`);

    // Org check — allow if intake is in user's org OR if user's org has a case referencing this intake.
    // (LINE Bot uploads may leave intake.organizationId null or mapped to a different org than the case.)
    if (organizationId && intake.organizationId && Number(intake.organizationId) !== organizationId) {
      const linkedCase = await this.prisma.inboundCase.findFirst({
        where: {
          organizationId: BigInt(organizationId),
          description: { contains: `intake:${id}` },
        },
        select: { id: true },
      });
      if (!linkedCase) {
        this.logger.warn(
          `getFileBuffer denied: intake #${id} org=${intake.organizationId} vs user org=${organizationId} (no linked case in user's org)`,
        );
        throw new NotFoundException(`DocumentIntake #${id} not found`);
      }
      this.logger.log(
        `getFileBuffer: intake #${id} org=${intake.organizationId} mismatch with user org=${organizationId} — allowed via linked case #${linkedCase.id}`,
      );
    }

    if (!intake.storagePath) {
      this.logger.warn(`getFileBuffer: intake #${id} has no storagePath`);
      throw new NotFoundException('ไม่พบไฟล์ต้นฉบับ (ไม่มีข้อมูลที่จัดเก็บ)');
    }

    // storagePath stored as "bucket/path" or just "path"
    const objectPath = intake.storagePath.startsWith(`${this.storage['bucket']}/`)
      ? intake.storagePath.slice(`${this.storage['bucket']}/`.length)
      : intake.storagePath;
    try {
      const buffer = await this.storage.getBuffer(objectPath);
      return {
        buffer,
        mimeType: intake.mimeType || 'application/octet-stream',
        fileName: (intake as any).originalFileName || `intake-${id}.pdf`,
      };
    } catch (err: any) {
      this.logger.error(
        `getFileBuffer: MinIO getObject failed for intake #${id} path="${objectPath}": ${err.message}`,
      );
      throw new NotFoundException('ไม่พบไฟล์ต้นฉบับ (ไฟล์อาจถูกลบจากที่จัดเก็บ)');
    }
  }

  async getResult(id: number, organizationId?: number) {
    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: BigInt(id) },
      include: { aiResult: true },
    });
    if (!intake) throw new NotFoundException(`DocumentIntake #${id} not found`);
    if (organizationId && intake.organizationId && Number(intake.organizationId) !== organizationId) {
      throw new NotFoundException(`DocumentIntake #${id} not found`);
    }
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
    organizationId?: number;
  }) {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
    const where: any = {};
    if (filters.organizationId) where.organizationId = BigInt(filters.organizationId);
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
      result.aiResult = this.serializeBigInts(intake.aiResult);
    }
    return result;
  }

  async updateAiResult(intakeId: number, data: { summaryText?: string; actions?: string[] }) {
    const aiResult = await this.prisma.documentAiResult.findUnique({
      where: { documentIntakeId: BigInt(intakeId) },
    });
    if (!aiResult) throw new NotFoundException(`AI result for intake #${intakeId} not found`);

    const updateData: any = {};
    if (data.summaryText !== undefined) updateData.summaryText = data.summaryText;
    if (data.actions !== undefined) updateData.nextActionJson = JSON.stringify(data.actions);

    await this.prisma.documentAiResult.update({
      where: { documentIntakeId: BigInt(intakeId) },
      data: updateData,
    });
    return { ok: true };
  }

  private serializeBigInts(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return Number(obj);
    if (Array.isArray(obj)) return obj.map((v) => this.serializeBigInts(v));
    if (obj instanceof Date) return obj;
    if (typeof obj === 'object') {
      const out: any = {};
      for (const k of Object.keys(obj)) out[k] = this.serializeBigInts(obj[k]);
      return out;
    }
    return obj;
  }
}
