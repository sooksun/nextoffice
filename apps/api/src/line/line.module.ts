import { Module, forwardRef } from '@nestjs/common';
import { LineWebhookController } from './controllers/line-webhook.controller';
import { LineReplyController } from './controllers/line-reply.controller';
import { LineSignatureService } from './services/line-signature.service';
import { LineEventsService } from './services/line-events.service';
import { LineUsersService } from './services/line-users.service';
import { LineMessagingService } from './services/line-messaging.service';
import { LineSessionService } from './services/line-session.service';
import { LinePairingService } from './services/line-pairing.service';
import { LineWorkflowService } from './services/line-workflow.service';
import { QueueModule } from '../queue/queue.module';
import { AuthModule } from '../auth/auth.module';
import { CasesModule } from '../cases/cases.module';

@Module({
  imports: [QueueModule, AuthModule, forwardRef(() => CasesModule)],
  controllers: [LineWebhookController, LineReplyController],
  providers: [
    LineSignatureService,
    LineEventsService,
    LineUsersService,
    LineMessagingService,
    LineSessionService,
    LinePairingService,
    LineWorkflowService,
  ],
  exports: [LineMessagingService, LineUsersService, LineSessionService],
})
export class LineModule {}
