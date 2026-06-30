import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DriveImportService } from './services/drive-import.service';

@Injectable()
export class DriveImportScheduler {
  private readonly logger = new Logger(DriveImportScheduler.name);

  constructor(private readonly driveImport: DriveImportService) {}

  @Cron('0 0 9-16 * * 1-5', { timeZone: 'Asia/Bangkok' })
  async scheduledDriveImport() {
    this.logger.debug('Cron: scheduledDriveImport');
    const results = await this.driveImport.scanActiveSources();
    const totalCreated = results.reduce((sum, item) => sum + (item.created || 0), 0);
    const totalUpdated = results.reduce((sum, item) => sum + (item.updated || 0), 0);
    if (totalCreated || totalUpdated) {
      this.logger.log(`Drive import scan completed: created=${totalCreated}, updated=${totalUpdated}`);
    }
  }
}
