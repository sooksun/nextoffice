import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_FILE_INTAKE } from '../queue/queue.constants';
import { DriveImportService } from './services/drive-import.service';

@Processor(QUEUE_FILE_INTAKE)
export class DriveImportProcessor {
  private readonly logger = new Logger(DriveImportProcessor.name);

  constructor(private readonly driveImport: DriveImportService) {}

  @Process('drive.import.file')
  async handleDriveImportFile(job: Job<{ importFileId: string }>) {
    const importFileId = BigInt(job.data.importFileId);
    this.logger.log(`Importing Google Drive file row #${importFileId}`);
    await this.driveImport.processImportFile(importFileId);
  }
}
