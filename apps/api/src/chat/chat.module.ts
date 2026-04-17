import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { AuthModule } from '../auth/auth.module';
import { GeminiModule } from '../gemini/gemini.module';
import { ChatController } from './controllers/chat.controller';
import { ChatService } from './services/chat.service';
import { ChatFeedbackService } from './services/chat-feedback.service';
import { PageContextService } from './services/page-context.service';

@Module({
  imports: [GeminiModule, RagModule, AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatFeedbackService, PageContextService],
})
export class ChatModule {}
