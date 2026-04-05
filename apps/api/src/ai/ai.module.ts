import { Module } from '@nestjs/common';
import { OcrService } from './services/ocr.service';
import { ClassifierService } from './services/classifier.service';
import { ExtractionService } from './services/extraction.service';
import { OfficialWorkflowService } from './services/official-workflow.service';
import { NonOfficialWorkflowService } from './services/non-official-workflow.service';
import { RagModule } from '../rag/rag.module';
import { LineModule } from '../line/line.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [GeminiModule, RagModule, LineModule],
  providers: [
    OcrService,
    ClassifierService,
    ExtractionService,
    OfficialWorkflowService,
    NonOfficialWorkflowService,
  ],
  exports: [
    OcrService,
    ClassifierService,
    ExtractionService,
    OfficialWorkflowService,
    NonOfficialWorkflowService,
  ],
})
export class AiModule {}
