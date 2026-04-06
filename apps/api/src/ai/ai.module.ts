import { Module } from '@nestjs/common';
import { OcrService } from './services/ocr.service';
import { ClassifierService } from './services/classifier.service';
import { ExtractionService } from './services/extraction.service';
import { OfficialWorkflowService } from './services/official-workflow.service';
import { NonOfficialWorkflowService } from './services/non-official-workflow.service';
import { PredictiveWorkflowService } from './services/predictive-workflow.service';
import { IntentClassifierService } from './services/intent-classifier.service';
import { DraftGeneratorService } from './services/draft-generator.service';
import { RagModule } from '../rag/rag.module';
import { LineModule } from '../line/line.module';
import { GeminiModule } from '../gemini/gemini.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CalendarModule } from '../calendar/calendar.module';
import { QueueModule } from '../queue/queue.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [GeminiModule, RagModule, LineModule, NotificationsModule, CalendarModule, QueueModule, ProjectsModule],
  providers: [
    OcrService,
    ClassifierService,
    ExtractionService,
    OfficialWorkflowService,
    NonOfficialWorkflowService,
    PredictiveWorkflowService,
    IntentClassifierService,
    DraftGeneratorService,
  ],
  exports: [
    OcrService,
    ClassifierService,
    ExtractionService,
    OfficialWorkflowService,
    NonOfficialWorkflowService,
    PredictiveWorkflowService,
    IntentClassifierService,
    DraftGeneratorService,
  ],
})
export class AiModule {}
