import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationService } from './notification.service';
import { NotificationScheduler } from './notification.scheduler';
import { SmartRoutingService } from './smart-routing.service';
import { LineModule } from '../line/line.module';

@Module({
  imports: [ScheduleModule.forRoot(), LineModule],
  providers: [NotificationService, NotificationScheduler, SmartRoutingService],
  exports: [NotificationService, SmartRoutingService],
})
export class NotificationsModule {}
