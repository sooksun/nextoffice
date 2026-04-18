import { Module, forwardRef } from '@nestjs/common';
import { LineWebhookController } from './controllers/line-webhook.controller';
import { LineReplyController } from './controllers/line-reply.controller';
import { LineAuthController } from './controllers/line-auth.controller';
import { LineAuthService } from './services/line-auth.service';
import { LineSignatureService } from './services/line-signature.service';
import { LineEventsService } from './services/line-events.service';
import { LineUsersService } from './services/line-users.service';
import { LineMessagingService } from './services/line-messaging.service';
import { LineSessionService } from './services/line-session.service';
import { LinePairingService } from './services/line-pairing.service';
import { LineWorkflowService } from './services/line-workflow.service';
import { LineInquiryService } from './services/line-inquiry.service';
import { LineAttendanceService } from './services/line-attendance.service';
import { IntentClassifierService } from '../ai/services/intent-classifier.service';
import { QueueModule } from '../queue/queue.module';
import { AuthModule } from '../auth/auth.module';
import { CasesModule } from '../cases/cases.module';
import { GeminiModule } from '../gemini/gemini.module';
import { KnowledgeImportModule } from '../knowledge-import/knowledge-import.module';

@Module({
  imports: [QueueModule, AuthModule, GeminiModule, forwardRef(() => CasesModule), KnowledgeImportModule],
  controllers: [LineWebhookController, LineReplyController, LineAuthController],
  providers: [
    LineSignatureService,
    LineEventsService,
    LineUsersService,
    LineMessagingService,
    LineSessionService,
    LinePairingService,
    LineWorkflowService,
    LineInquiryService,
    LineAttendanceService,
    LineAuthService,
    IntentClassifierService,
  ],
  exports: [LineMessagingService, LineUsersService, LineSessionService, LineAttendanceService],
})
export class LineModule {}
