import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { IntakeModule } from '../intake/intake.module';
import { QueueModule } from '../queue/queue.module';
import { DriveImportController } from './controllers/drive-import.controller';
import { DriveImportProcessor } from './drive-import.processor';
import { DriveImportScheduler } from './drive-import.scheduler';
import { DocumentTextExtractorService } from './services/document-text-extractor.service';
import { DriveImportService } from './services/drive-import.service';
import { DriveMappingService } from './services/drive-mapping.service';

@Module({
  imports: [QueueModule, IntakeModule, forwardRef(() => AiModule)],
  controllers: [DriveImportController],
  providers: [
    DriveImportService,
    DriveMappingService,
    DocumentTextExtractorService,
    DriveImportProcessor,
    DriveImportScheduler,
  ],
  exports: [DriveImportService],
})
export class DriveImportModule {}
