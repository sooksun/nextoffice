import { Module, forwardRef } from '@nestjs/common';
import { IntakeController } from './controllers/intake.controller';
import { IntakeService } from './services/intake.service';
import { FileStorageService } from './services/file-storage.service';
import { ContentFetchService } from './services/content-fetch.service';
import { GoogleDriveService } from './services/google-drive.service';
import { QueueModule } from '../queue/queue.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [QueueModule, forwardRef(() => AiModule), AuthModule],
  controllers: [IntakeController],
  providers: [IntakeService, FileStorageService, ContentFetchService, GoogleDriveService],
  exports: [IntakeService, FileStorageService, ContentFetchService],
})
export class IntakeModule {}
