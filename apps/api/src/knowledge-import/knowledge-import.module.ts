import { Module } from '@nestjs/common';
import { KnowledgeImportController } from './knowledge-import.controller';
import { KnowledgeImportService } from './knowledge-import.service';
import { KnowledgeImportProcessor } from './knowledge-import.processor';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { IntakeModule } from '../intake/intake.module';
import { RagModule } from '../rag/rag.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [AuthModule, QueueModule, IntakeModule, RagModule, GeminiModule],
  controllers: [KnowledgeImportController],
  providers: [KnowledgeImportService, KnowledgeImportProcessor],
  exports: [KnowledgeImportService],
})
export class KnowledgeImportModule {}
