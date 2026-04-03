import { Module } from '@nestjs/common';
import { IntakeController } from './controllers/intake.controller';
import { IntakeService } from './services/intake.service';
import { FileStorageService } from './services/file-storage.service';
import { ContentFetchService } from './services/content-fetch.service';
import { GoogleDriveService } from './services/google-drive.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [IntakeController],
  providers: [IntakeService, FileStorageService, ContentFetchService, GoogleDriveService],
  exports: [IntakeService, FileStorageService, ContentFetchService],
})
export class IntakeModule {}
