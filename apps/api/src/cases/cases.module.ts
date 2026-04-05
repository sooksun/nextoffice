import { Module } from '@nestjs/common';
import { CasesController } from './controllers/cases.controller';
import { CasesService } from './services/cases.service';
import { CaseWorkflowService } from './services/case-workflow.service';
import { AuthModule } from '../auth/auth.module';
import { CalendarModule } from '../calendar/calendar.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, CalendarModule, NotificationsModule],
  controllers: [CasesController],
  providers: [CasesService, CaseWorkflowService],
  exports: [CasesService, CaseWorkflowService],
})
export class CasesModule {}
