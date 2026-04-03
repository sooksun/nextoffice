import { Module } from '@nestjs/common';
import { LineWebhookController } from './controllers/line-webhook.controller';
import { LineReplyController } from './controllers/line-reply.controller';
import { LineSignatureService } from './services/line-signature.service';
import { LineEventsService } from './services/line-events.service';
import { LineUsersService } from './services/line-users.service';
import { LineMessagingService } from './services/line-messaging.service';
import { LineSessionService } from './services/line-session.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [LineWebhookController, LineReplyController],
  providers: [
    LineSignatureService,
    LineEventsService,
    LineUsersService,
    LineMessagingService,
    LineSessionService,
  ],
  exports: [LineMessagingService, LineUsersService, LineSessionService],
})
export class LineModule {}
