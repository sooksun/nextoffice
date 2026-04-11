import { Module, forwardRef } from '@nestjs/common';
import { CasesController } from './controllers/cases.controller';
import { CasesService } from './services/cases.service';
import { CaseWorkflowService } from './services/case-workflow.service';
import { AuthModule } from '../auth/auth.module';
import { CalendarModule } from '../calendar/calendar.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { RagModule } from '../rag/rag.module';
import { QueueModule } from '../queue/queue.module';
import { ProjectsModule } from '../projects/projects.module';
import { GeminiModule } from '../gemini/gemini.module';
import { StampsModule } from '../stamps/stamps.module';
import { IntakeModule } from '../intake/intake.module';
import { DigitalSignatureModule } from '../digital-signature/digital-signature.module';

@Module({
  imports: [AuthModule, CalendarModule, NotificationsModule, forwardRef(() => AiModule), RagModule, QueueModule, ProjectsModule, GeminiModule, StampsModule, IntakeModule, DigitalSignatureModule],
  controllers: [CasesController],
  providers: [CasesService, CaseWorkflowService],
  exports: [CasesService, CaseWorkflowService],
})
export class CasesModule {}
