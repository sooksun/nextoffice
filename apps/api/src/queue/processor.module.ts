import { Module } from '@nestjs/common';
import { QueueModule } from './queue.module';
import { LineModule } from '../line/line.module';
import { RagModule } from '../rag/rag.module';
import { IntakeProcessor } from './processors/intake.processor';
import { OcrProcessor } from './processors/ocr.processor';
import { ClassifyProcessor } from './processors/classify.processor';
import { OfficialProcessor } from './processors/official.processor';
import { ClarificationProcessor } from './processors/clarification.processor';
import { DriveBackupProcessor } from './processors/drive-backup.processor';
import { LineMenuActionProcessor } from './processors/line-menu-action.processor';

@Module({
  imports: [QueueModule, LineModule, RagModule],
  providers: [
    IntakeProcessor,
    OcrProcessor,
    ClassifyProcessor,
    OfficialProcessor,
    ClarificationProcessor,
    DriveBackupProcessor,
    LineMenuActionProcessor,
  ],
})
export class ProcessorModule {}
