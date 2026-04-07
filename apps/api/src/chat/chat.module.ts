import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { AuthModule } from '../auth/auth.module';
import { GeminiModule } from '../gemini/gemini.module';
import { ChatController } from './controllers/chat.controller';
import { ChatService } from './services/chat.service';
import { PageContextService } from './services/page-context.service';

@Module({
  imports: [GeminiModule, RagModule, AuthModule],
  controllers: [ChatController],
  providers: [ChatService, PageContextService],
})
export class ChatModule {}
