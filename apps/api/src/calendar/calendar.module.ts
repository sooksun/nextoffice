import { Module } from '@nestjs/common';
import { GoogleCalendarService } from './services/google-calendar.service';

@Module({
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class CalendarModule {}
