import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { AuthModule } from '../auth/auth.module';
import { GeminiModule } from '../gemini/gemini.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { ChatController } from './controllers/chat.controller';
import { ChatService } from './services/chat.service';
import { ChatFeedbackService } from './services/chat-feedback.service';
import { PageContextService } from './services/page-context.service';
import { DocumentIntentService } from './services/document-intent.service';
import { DocumentDraftService } from './services/document-draft.service';

@Module({
  imports: [GeminiModule, RagModule, AuthModule, AttendanceModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatFeedbackService,
    PageContextService,
    DocumentIntentService,
    DocumentDraftService,
  ],
})
export class ChatModule {}
