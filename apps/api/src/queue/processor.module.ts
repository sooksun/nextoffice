import { Module } from '@nestjs/common';
import { QueueModule } from './queue.module';
import { LineModule } from '../line/line.module';
import { RagModule } from '../rag/rag.module';
import { AiModule } from '../ai/ai.module';
import { GeminiModule } from '../gemini/gemini.module';
import { IntakeModule } from '../intake/intake.module';
import { HorizonModule } from '../horizon/horizon.module';
import { VaultModule } from '../vault/vault.module';
import { IntakeProcessor } from './processors/intake.processor';
import { OcrProcessor } from './processors/ocr.processor';
import { ClassifyProcessor } from './processors/classify.processor';
import { OfficialProcessor } from './processors/official.processor';
import { ClarificationProcessor } from './processors/clarification.processor';
import { DriveBackupProcessor } from './processors/drive-backup.processor';
import { LineMenuActionProcessor } from './processors/line-menu-action.processor';
import { HorizonProcessor } from './processors/horizon.processor';
import { VaultProcessor } from './processors/vault.processor';

@Module({
  imports: [QueueModule, LineModule, RagModule, AiModule, GeminiModule, IntakeModule, HorizonModule, VaultModule],
  providers: [
    IntakeProcessor,
    OcrProcessor,
    ClassifyProcessor,
    OfficialProcessor,
    ClarificationProcessor,
    DriveBackupProcessor,
    LineMenuActionProcessor,
    HorizonProcessor,
    VaultProcessor,
  ],
})
export class ProcessorModule {}
