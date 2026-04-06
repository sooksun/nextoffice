import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueDispatcherService } from './services/queue-dispatcher.service';
import {
  QUEUE_LINE_EVENTS,
  QUEUE_FILE_INTAKE,
  QUEUE_AI_PROCESSING,
  QUEUE_OUTBOUND,
  QUEUE_HORIZON,
} from './queue.constants';

export * from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE_LINE_EVENTS },
      { name: QUEUE_FILE_INTAKE },
      { name: QUEUE_AI_PROCESSING },
      { name: QUEUE_OUTBOUND },
      { name: QUEUE_HORIZON },
    ),
  ],
  providers: [QueueDispatcherService],
  exports: [BullModule, QueueDispatcherService],
})
export class QueueModule {}
