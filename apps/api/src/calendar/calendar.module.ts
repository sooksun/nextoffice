import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { GoogleCalendarService } from './services/google-calendar.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CalendarController],
  providers: [CalendarService, GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class CalendarModule {}
