import { Controller, Post, Body, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ChatService } from '../services/chat.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

class ChatMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  query: string;
}

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  @HttpCode(200)
  @ApiOperation({ summary: 'Chat with AI สารบรรณ assistant using RAG' })
  @ApiBody({
    schema: {
      example: { query: 'หนังสือราชการมีกี่ประเภท อะไรบ้าง?' },
    },
  })
  chat(@Body() body: ChatMessageDto) {
    return this.chatService.chat(body.query);
  }
}
