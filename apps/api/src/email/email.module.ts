import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { OutboundEmailProcessor } from './outbound-email.processor';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  providers: [EmailService, OutboundEmailProcessor],
  exports: [EmailService],
})
export class EmailModule {}
