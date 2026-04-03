import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    QueueModule,
    ProcessorModule,
    OrganizationsModule,
    LineModule,
    IntakeModule,
    AiModule,
    RagModule,
    CasesModule,
    DocumentsModule,
    ChatModule,
  ],
})
export class AppModule {}
