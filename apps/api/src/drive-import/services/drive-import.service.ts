import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { GoogleDriveImportFile, GoogleDriveImportSource, Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleDriveService, DriveFileInfo } from '../../intake/services/google-drive.service';
import { FileStorageService } from '../../intake/services/file-storage.service';
import { ClassifierService } from '../../ai/services/classifier.service';
import { OfficialWorkflowService } from '../../ai/services/official-workflow.service';
import { QUEUE_FILE_INTAKE } from '../../queue/queue.constants';
import { DriveMappingService } from './drive-mapping.service';
import { DocumentTextExtractorService } from './document-text-extractor.service';
import {
  CreateDriveImportSourceDto,
  TestDriveLinkDto,
  UpdateDriveImportFileMappingDto,
  UpdateDriveImportSourceDto,
} from '../dto/drive-import.dto';

const DEFAULT_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1OIwrshYMA9yBmYT_AXViENFJaltsT8P-?usp=sharing';
const DEFAULT_SYNC_CRON = '0 0 9-16 * * 1-5';
const DEFAULT_SYNC_TIMEZONE = 'Asia/Bangkok';

export interface DriveImportUser {
  id?: bigint | number | string | null;
  organizationId?: bigint | number | string | null;
  roleCode?: string | null;
}

export interface DriveImportFileFilters {
  status?: string;
  academicYearId?: string;
  workGroupId?: string;
}

export interface ScanSourceResult {
  sourceId: number;
  scanned?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  ok?: boolean;
  error?: string;
}

const SUPPORTED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
]);

@Injectable()
export class DriveImportService {
  private readonly logger = new Logger(DriveImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly drive: GoogleDriveService,
    private readonly storage: FileStorageService,
    private readonly mapping: DriveMappingService,
    private readonly textExtractor: DocumentTextExtractorService,
    private readonly classifier: ClassifierService,
    private readonly officialWorkflow: OfficialWorkflowService,
    @InjectQueue(QUEUE_FILE_INTAKE) private readonly fileQueue: Queue,
  ) {}

  async testLink(dto: TestDriveLinkDto) {
    const folderId = this.resolveFolderId(dto);
    const metadata = await this.drive.getFolderMetadata(folderId);
    return {
      ok: true,
      rootFolderId: metadata.id,
      rootFolderName: metadata.name,
      webViewLink: metadata.webViewLink,
    };
  }

  async createSource(user: DriveImportUser, dto: CreateDriveImportSourceDto) {
    const organizationId = this.requireOrgId(user);
    const rootFolderUrl = dto.rootFolderUrl?.trim() || DEFAULT_DRIVE_FOLDER_URL;
    const rootFolderId = this.resolveFolderId({ rootFolderUrl, rootFolderId: dto.rootFolderId });
    const metadata = await this.drive.getFolderMetadata(rootFolderId);
    const db = this.prisma;

    const source = await db.googleDriveImportSource.create({
      data: {
        organizationId,
        name: dto.name?.trim() || metadata.name || 'Google Drive Import',
        rootFolderUrl,
        rootFolderId: metadata.id,
        rootFolderName: metadata.name,
        folderMappingJson: dto.folderMappingJson || null,
        syncMode: dto.syncMode || 'scheduled',
        syncCron: dto.syncCron || DEFAULT_SYNC_CRON,
        syncTimezone: dto.syncTimezone || DEFAULT_SYNC_TIMEZONE,
        isActive: dto.isActive ?? true,
        createdByUserId: user?.id ? BigInt(user.id) : null,
      },
    });

    return this.serialize(source);
  }

  async updateSource(user: DriveImportUser, id: number, dto: UpdateDriveImportSourceDto) {
    const where = this.sourceWhere(user, id);
    const db = this.prisma;
    const current = await db.googleDriveImportSource.findFirst({ where });
    if (!current) throw new NotFoundException(`Drive import source #${id} not found`);

    const data: Prisma.GoogleDriveImportSourceUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name?.trim() || current.name;
    if (dto.folderMappingJson !== undefined) data.folderMappingJson = dto.folderMappingJson || null;
    if (dto.syncMode !== undefined) data.syncMode = dto.syncMode || current.syncMode;
    if (dto.syncCron !== undefined) data.syncCron = dto.syncCron || DEFAULT_SYNC_CRON;
    if (dto.syncTimezone !== undefined) data.syncTimezone = dto.syncTimezone || DEFAULT_SYNC_TIMEZONE;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (dto.rootFolderUrl || dto.rootFolderId) {
      const rootFolderId = this.resolveFolderId(dto);
      const metadata = await this.drive.getFolderMetadata(rootFolderId);
      data.rootFolderUrl = dto.rootFolderUrl?.trim() || metadata.webViewLink || current.rootFolderUrl;
      data.rootFolderId = metadata.id;
      data.rootFolderName = metadata.name;
      data.lastSyncToken = null;
      data.lastSyncedAt = null;
    }

    const source = await db.googleDriveImportSource.update({
      where: { id: BigInt(id) },
      data,
    });
    return this.serialize(source);
  }

  async listSources(user: DriveImportUser) {
    const db = this.prisma;
    const organizationId = this.requireOrgId(user);
    const sources = await db.googleDriveImportSource.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });
    return sources.map((source) => this.serialize(source));
  }

  async scanSource(user: DriveImportUser, id: number) {
    const source = await this.findSourceForUser(user, id);
    return this.scanSourceRecord(source);
  }

  async scanActiveSources(): Promise<ScanSourceResult[]> {
    const db = this.prisma;
    const sources = await db.googleDriveImportSource.findMany({
      where: { isActive: true, syncMode: 'scheduled' },
      take: 20,
    });

    const results: ScanSourceResult[] = [];
    for (const source of sources) {
      try {
        results.push(await this.scanSourceRecord(source));
      } catch (err: unknown) {
        const message = this.errorMessage(err);
        this.logger.warn(`Scheduled Drive scan failed for source #${source.id}: ${message}`);
        results.push({ sourceId: Number(source.id), ok: false, error: message });
      }
    }
    return results;
  }

  async listFiles(user: DriveImportUser, filters: DriveImportFileFilters = {}) {
    const db = this.prisma;
    const organizationId = this.requireOrgId(user);
    const where: Prisma.GoogleDriveImportFileWhereInput = { organizationId };
    if (filters.status) where.status = filters.status;
    if (filters.academicYearId) where.academicYearId = BigInt(filters.academicYearId);
    if (filters.workGroupId) where.workGroupId = BigInt(filters.workGroupId);

    const files = await db.googleDriveImportFile.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return files.map((file) => this.serialize(file));
  }

  async queueImport(user: DriveImportUser, id: number) {
    const file = await this.findFileForUser(user, id);
    if (!SUPPORTED_MIMES.has(file.mimeType)) {
      await this.updateImportFileStatus(file.id, 'needs_conversion', `Unsupported MIME type: ${file.mimeType}`);
      throw new BadRequestException(`Unsupported MIME type: ${file.mimeType}`);
    }

    const db = this.prisma;
    await db.googleDriveImportFile.update({
      where: { id: file.id },
      data: { status: 'queued', errorMessage: null },
    });
    await this.fileQueue.add('drive.import.file', { importFileId: file.id.toString() }, { attempts: 1 });
    return { id: Number(file.id), status: 'queued' };
  }

  async queueBulkImport(user: DriveImportUser, ids?: number[]) {
    const db = this.prisma;
    const organizationId = this.requireOrgId(user);
    const where: Prisma.GoogleDriveImportFileWhereInput = {
      organizationId,
      status: { in: ['discovered', 'failed'] },
    };
    if (ids?.length) where.id = { in: ids.map((id) => BigInt(id)) };

    const files = await db.googleDriveImportFile.findMany({ where, take: 100 });
    let queued = 0;
    for (const file of files) {
      if (!SUPPORTED_MIMES.has(file.mimeType)) {
        await this.updateImportFileStatus(file.id, 'needs_conversion', `Unsupported MIME type: ${file.mimeType}`);
        continue;
      }
      await db.googleDriveImportFile.update({
        where: { id: file.id },
        data: { status: 'queued', errorMessage: null },
      });
      await this.fileQueue.add('drive.import.file', { importFileId: file.id.toString() }, { attempts: 1 });
      queued++;
    }
    return { queued, totalCandidates: files.length };
  }

  async updateFileMapping(user: DriveImportUser, id: number, dto: UpdateDriveImportFileMappingDto) {
    const file = await this.findFileForUser(user, id);
    const db = this.prisma;
    const updated = await db.googleDriveImportFile.update({
      where: { id: file.id },
      data: {
        academicYearId: dto.academicYearId ? BigInt(dto.academicYearId) : file.academicYearId,
        workGroupId: dto.workGroupId ? BigInt(dto.workGroupId) : file.workGroupId,
        workFunctionId: dto.workFunctionId ? BigInt(dto.workFunctionId) : file.workFunctionId,
        mappingConfidence: 1,
        mappingReason: 'manual override',
      },
    });
    return this.serialize(updated);
  }

  async processImportFile(importFileId: bigint) {
    const db = this.prisma;
    const file = await db.googleDriveImportFile.findUnique({ where: { id: importFileId } });
    if (!file) throw new NotFoundException(`Drive import file #${importFileId} not found`);
    if (file.status === 'imported' && file.documentIntakeId) return;
    if (!SUPPORTED_MIMES.has(file.mimeType)) {
      await this.updateImportFileStatus(file.id, 'needs_conversion', `Unsupported MIME type: ${file.mimeType}`);
      return;
    }

    await this.updateImportFileStatus(file.id, 'importing');

    try {
      const source = await db.googleDriveImportSource.findUnique({ where: { id: file.sourceId } });
      if (!source) throw new Error(`Drive import source #${file.sourceId} not found`);

      const driveInfo = this.toDriveFileInfo(file);
      const mapping = await this.mapping.mapFile(file.organizationId, driveInfo);
      const downloaded = await this.drive.downloadForImport(driveInfo);
      const sha256 = this.storage.computeSha256(downloaded.buffer);
      const objectPath = this.buildObjectPath({
        organizationId: Number(file.organizationId),
        academicYear: mapping.academicYearLabel,
        month: mapping.month,
        day: mapping.day,
        workGroupCode: mapping.workGroupCode,
        driveFileId: file.driveFileId,
        fileName: downloaded.fileName,
      });

      await this.storage.saveBuffer(objectPath, downloaded.buffer, downloaded.mimeType);

      const intake = await this.prisma.documentIntake.create({
        data: {
          sourceChannel: 'google_drive_import',
          organizationId: file.organizationId,
          academicYearId: mapping.academicYearId,
          originalFileName: downloaded.fileName,
          mimeType: downloaded.mimeType,
          fileExtension: this.fileExtension(downloaded.fileName),
          fileSize: BigInt(downloaded.buffer.length),
          storagePath: objectPath,
          sha256,
          googleDriveFileId: file.driveFileId,
          googleDriveFolderId: file.driveFolderId,
          uploadStatus: 'stored',
          ocrStatus: 'processing',
          classifierStatus: 'pending',
          aiStatus: 'pending',
        },
      });

      const extractedText = await this.textExtractor.extractText(
        downloaded.buffer,
        downloaded.mimeType,
        downloaded.extractedText,
      );

      const aiResult = await this.prisma.documentAiResult.create({
        data: {
          documentIntakeId: intake.id,
          extractedText,
        },
      });

      await this.prisma.documentIntake.update({
        where: { id: intake.id },
        data: { ocrStatus: extractedText ? 'done' : 'failed', classifierStatus: 'processing' },
      });

      const classResult = await this.classifier.classifyDocument(extractedText, {
        mimeType: downloaded.mimeType,
        originalFileName: downloaded.fileName,
      });

      await this.prisma.documentAiResult.update({
        where: { id: aiResult.id },
        data: {
          isOfficialDocument: classResult.isOfficialDocument,
          classificationLabel: classResult.classificationLabel,
          classificationConfidence: classResult.classificationConfidence,
        },
      });

      await this.prisma.documentIntake.update({
        where: { id: intake.id },
        data: { classifierStatus: 'done', aiStatus: classResult.isOfficialDocument ? 'analyzing' : 'done' },
      });

      let inboundCaseId: bigint | null = null;
      if (classResult.isOfficialDocument) {
        await this.officialWorkflow.process(intake.id);
        const inboundCase = await this.prisma.inboundCase.findFirst({
          where: {
            organizationId: file.organizationId,
            description: { contains: `intake:${intake.id}` },
          },
          orderBy: { createdAt: 'desc' },
        });
        inboundCaseId = inboundCase?.id ?? null;
        if (inboundCaseId && mapping.academicYearId) {
          await this.prisma.inboundCase.update({
            where: { id: inboundCaseId },
            data: { academicYearId: mapping.academicYearId },
          });
        }
      }

      await db.googleDriveImportFile.update({
        where: { id: file.id },
        data: {
          status: classResult.isOfficialDocument ? 'imported' : 'non_official',
          errorMessage: null,
          sha256,
          academicYearId: mapping.academicYearId,
          workGroupId: mapping.workGroupId,
          documentIntakeId: intake.id,
          inboundCaseId,
          mappingConfidence: mapping.confidence,
          mappingReason: mapping.reason,
          importedAt: new Date(),
        },
      });
    } catch (err: unknown) {
      await this.updateImportFileStatus(file.id, 'failed', this.errorMessage(err));
      throw err;
    }
  }

  private async scanSourceRecord(source: GoogleDriveImportSource): Promise<ScanSourceResult> {
    const db = this.prisma;
    const files = await this.drive.listFilesRecursive(source.rootFolderId, source.rootFolderName || '');
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const file of files) {
      const mapping = await this.mapping.mapFile(source.organizationId, file);
      const status = SUPPORTED_MIMES.has(file.mimeType) ? 'discovered' : 'needs_conversion';
      const existing = await db.googleDriveImportFile.findFirst({
        where: {
          organizationId: source.organizationId,
          driveFileId: file.id,
          modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
        },
      });

      const data = {
        sourceId: source.id,
        organizationId: source.organizationId,
        driveFileId: file.id,
        driveFolderId: file.parentId,
        drivePath: file.path,
        fileName: file.name,
        mimeType: file.mimeType,
        md5Checksum: file.md5Checksum ?? null,
        size: file.size ? BigInt(file.size) : null,
        modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
        webViewLink: file.webViewLink ?? null,
        academicYearId: mapping.academicYearId,
        workGroupId: mapping.workGroupId,
        mappingConfidence: mapping.confidence,
        mappingReason: mapping.reason,
      };

      if (existing) {
        if (['imported', 'queued', 'importing', 'non_official'].includes(existing.status)) {
          skipped++;
          continue;
        }
        await db.googleDriveImportFile.update({
          where: { id: existing.id },
          data: { ...data, status, errorMessage: status === 'needs_conversion' ? `Unsupported MIME type: ${file.mimeType}` : null },
        });
        updated++;
      } else {
        await db.googleDriveImportFile.create({
          data: { ...data, status, errorMessage: status === 'needs_conversion' ? `Unsupported MIME type: ${file.mimeType}` : null },
        });
        created++;
      }
    }

    await db.googleDriveImportSource.update({
      where: { id: source.id },
      data: { lastSyncedAt: new Date() },
    });

    return {
      sourceId: Number(source.id),
      scanned: files.length,
      created,
      updated,
      skipped,
    };
  }

  private resolveFolderId(dto: TestDriveLinkDto): string {
    const folderId = this.drive.extractFolderId(dto.rootFolderUrl) || this.drive.extractFolderId(dto.rootFolderId);
    if (!folderId) {
      throw new BadRequestException('Invalid Google Drive folder URL or folder ID');
    }
    return folderId;
  }

  private requireOrgId(user: DriveImportUser): bigint {
    if (!user?.organizationId) throw new BadRequestException('Google Drive import requires organization scope');
    return BigInt(user.organizationId);
  }

  private sourceWhere(user: DriveImportUser, id: number): Prisma.GoogleDriveImportSourceWhereInput {
    const where: Prisma.GoogleDriveImportSourceWhereInput = { id: BigInt(id) };
    if (user?.roleCode !== 'ADMIN') where.organizationId = this.requireOrgId(user);
    return where;
  }

  private async findSourceForUser(user: DriveImportUser, id: number): Promise<GoogleDriveImportSource> {
    const db = this.prisma;
    const source = await db.googleDriveImportSource.findFirst({ where: this.sourceWhere(user, id) });
    if (!source) throw new NotFoundException(`Drive import source #${id} not found`);
    return source;
  }

  private async findFileForUser(user: DriveImportUser, id: number): Promise<GoogleDriveImportFile> {
    const db = this.prisma;
    const where: Prisma.GoogleDriveImportFileWhereInput = { id: BigInt(id) };
    if (user?.roleCode !== 'ADMIN') where.organizationId = this.requireOrgId(user);
    const file = await db.googleDriveImportFile.findFirst({ where });
    if (!file) throw new NotFoundException(`Drive import file #${id} not found`);
    return file;
  }

  private async updateImportFileStatus(id: bigint, status: string, errorMessage?: string) {
    const db = this.prisma;
    await db.googleDriveImportFile.update({
      where: { id },
      data: { status, errorMessage: errorMessage || null },
    });
  }

  private toDriveFileInfo(file: GoogleDriveImportFile): DriveFileInfo {
    return {
      id: file.driveFileId,
      name: file.fileName,
      mimeType: file.mimeType,
      md5Checksum: file.md5Checksum,
      size: file.size ? String(file.size) : null,
      modifiedTime: file.modifiedTime?.toISOString?.() ?? null,
      webViewLink: file.webViewLink,
      parentId: file.driveFolderId,
      path: file.drivePath || file.fileName,
    };
  }

  private buildObjectPath(opts: {
    organizationId: number;
    academicYear: string;
    month: string;
    day: string;
    workGroupCode: string;
    driveFileId: string;
    fileName: string;
  }): string {
    return [
      'google-drive',
      String(opts.organizationId),
      opts.academicYear,
      opts.month,
      opts.day,
      this.sanitizePathSegment(opts.workGroupCode),
      this.sanitizePathSegment(opts.driveFileId),
      this.sanitizePathSegment(opts.fileName),
    ].join('/');
  }

  private sanitizePathSegment(value: string): string {
    return (value || 'unknown')
      .replace(/[<>:"\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'unknown';
  }

  private fileExtension(fileName: string): string | null {
    const ext = fileName.split('.').pop();
    return ext && ext !== fileName ? ext.toLowerCase() : null;
  }

  private serialize(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'bigint') return Number(value);
    if (value instanceof Date) return value;
    if (Array.isArray(value)) return value.map((item) => this.serialize(item));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) out[key] = this.serialize(record[key]);
      return out;
    }
    return value;
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
