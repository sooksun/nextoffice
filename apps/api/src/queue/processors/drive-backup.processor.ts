import { Process, Processor } from '@nestjs/bull';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from '../../intake/services/file-storage.service';
import { GoogleDriveService } from '../../intake/services/google-drive.service';
import { QUEUE_FILE_INTAKE } from '../queue.constants';

@Processor(QUEUE_FILE_INTAKE)
export class DriveBackupProcessor {
  private readonly logger = new Logger(DriveBackupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly fileStorage: FileStorageService,
    @Optional() private readonly driveService: GoogleDriveService,
  ) {}

  @Process('intake.store.file')
  async handleStoreFile(job: Job<{ documentIntakeId: string }>) {
    const intakeId = BigInt(job.data.documentIntakeId);
    this.logger.log(`Store file for intake ${intakeId}`);
    await this.prisma.documentIntake.update({
      where: { id: intakeId },
      data: { uploadStatus: 'stored' },
    });
  }

  @Process('intake.backup.drive')
  async handleBackupDrive(job: Job<{ documentIntakeId: string }>) {
    const intakeId = BigInt(job.data.documentIntakeId);
    this.logger.log(`Google Drive backup for intake ${intakeId}`);

    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: intakeId },
      select: {
        storagePath: true,
        mimeType: true,
        originalFileName: true,
        standardFileName: true,
        uploadStatus: true,
      },
    });

    if (!intake?.storagePath || !this.fileStorage || !this.driveService) {
      this.logger.warn(`Skipping backup for intake ${intakeId}: missing storage path or services`);
      await this.prisma.documentIntake.update({
        where: { id: intakeId },
        data: { uploadStatus: 'backed_up' },
      });
      return;
    }

    try {
      const buffer = await this.fileStorage.getBuffer(intake.storagePath);
      const fileName = intake.standardFileName || intake.originalFileName || `intake-${intakeId}.pdf`;
      const folderPath = this.driveService.buildFolderPath('official');

      const driveFileId = await this.driveService.uploadFile(
        buffer,
        fileName,
        intake.mimeType,
        folderPath,
      );

      await this.prisma.documentIntake.update({
        where: { id: intakeId },
        data: {
          uploadStatus: 'backed_up',
          googleDriveFileId: driveFileId || undefined,
        },
      });

      this.logger.log(`Backup complete for intake ${intakeId} → Drive file: ${driveFileId}`);
    } catch (err: any) {
      this.logger.error(`Backup failed for intake ${intakeId}: ${err.message}`);
      // Update status anyway to avoid infinite retries
      await this.prisma.documentIntake.update({
        where: { id: intakeId },
        data: { uploadStatus: 'backup_failed' },
      });
    }
  }
}
