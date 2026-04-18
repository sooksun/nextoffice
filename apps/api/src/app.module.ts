import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolveApiRootEnvPath } from './load-env';
import { PrismaModule } from './prisma/prisma.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { LineModule } from './line/line.module';
import { IntakeModule } from './intake/intake.module';
import { AiModule } from './ai/ai.module';
import { RagModule } from './rag/rag.module';
import { CasesModule } from './cases/cases.module';
import { DocumentsModule } from './documents/documents.module';
import { QueueModule } from './queue/queue.module';
import { ProcessorModule } from './queue/processor.module';
import { ChatModule } from './chat/chat.module';
import { AuthModule } from './auth/auth.module';
import { AcademicYearsModule } from './academic-years/academic-years.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { CalendarModule } from './calendar/calendar.module';
import { WorkGroupsModule } from './work-groups/work-groups.module';
import { OutboundModule } from './outbound/outbound.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SystemPromptsModule } from './system-prompts/system-prompts.module';
import { HorizonModule } from './horizon/horizon.module';
import { ProjectsModule } from './projects/projects.module';
import { VaultModule } from './vault/vault.module';
import { AttendanceModule } from './attendance/attendance.module';
import { KnowledgeImportModule } from './knowledge-import/knowledge-import.module';
import { StampsModule } from './stamps/stamps.module';
import { StaffConfigModule } from './staff-config/staff-config.module';
import { EmailModule } from './email/email.module';
import { DigitalSignatureModule } from './digital-signature/digital-signature.module';
import { ArchiveModule } from './archive/archive.module';
import { TemplatesModule } from './templates/templates.module';
import { TrackingModule } from './tracking/tracking.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { LoansModule } from './loans/loans.module';
import { HandoverModule } from './handover/handover.module';
import { CircularModule } from './circular/circular.module';
import { PresentationModule } from './presentation/presentation.module';
import { DownloadModule } from './download/download.module';
import { NewsModule } from './news/news.module';
import { TenderModule } from './tender/tender.module';
import { WebboardModule } from './webboard/webboard.module';
import { MessagesModule } from './messages/messages.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveApiRootEnvPath(),
    }),
    PrismaModule,
    SystemPromptsModule,
    QueueModule,
    ProcessorModule,
    AuthModule,
    OrganizationsModule,
    LineModule,
    IntakeModule,
    AiModule,
    RagModule,
    CasesModule,
    DocumentsModule,
    ChatModule,
    AcademicYearsModule,
    KnowledgeModule,
    CalendarModule,
    WorkGroupsModule,
    OutboundModule,
    ReportsModule,
    NotificationsModule,
    HorizonModule,
    ProjectsModule,
    VaultModule,
    AttendanceModule,
    KnowledgeImportModule,
    StampsModule,
    StaffConfigModule,
    EmailModule,
    DigitalSignatureModule,
    ArchiveModule,
    TemplatesModule,
    TrackingModule,
    DispatchModule,
    LoansModule,
    HandoverModule,
    CircularModule,
    PresentationModule,
    DownloadModule,
    NewsModule,
    TenderModule,
    WebboardModule,
    MessagesModule,
    SearchModule,
  ],
})
export class AppModule {}
