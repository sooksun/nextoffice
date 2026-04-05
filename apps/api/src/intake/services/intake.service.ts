import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from './file-storage.service';
import { GoogleDriveService } from './google-drive.service';
import { QueueDispatcherService } from '../../queue/services/queue-dispatcher.service';

@Injectable()
export class IntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly drive: GoogleDriveService,
    private readonly dispatcher: QueueDispatcherService,
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
