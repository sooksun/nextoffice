import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { ChatController } from './controllers/chat.controller';
import { ChatService } from './services/chat.service';

@Module({
  imports: [RagModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
