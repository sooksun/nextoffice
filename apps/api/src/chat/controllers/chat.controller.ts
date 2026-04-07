import { Controller, Post, Body, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ChatService } from '../services/chat.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

class PageContextDto {
  @IsString()
  @IsNotEmpty()
  route: string;

  @IsOptional()
  @IsNumber()
  entityId?: number;

  @IsOptional()
  @IsString()
  searchQuery?: string;

  @IsOptional()
  filters?: Record<string, string>;
}

class ChatMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  query: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PageContextDto)
  pageContext?: PageContextDto;
}

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  @HttpCode(200)
  @ApiOperation({ summary: 'Chat with AI สารบรรณ assistant using RAG + page context' })
  @ApiBody({
    schema: {
      example: {
        query: 'หนังสือฉบับนี้เกี่ยวกับอะไร?',
        pageContext: { route: '/inbox/42', entityId: 42 },
      },
    },
  })
  chat(@Body() body: ChatMessageDto, @CurrentUser() user: any) {
    return this.chatService.chat(body.query, body.pageContext, user?.id ? Number(user.id) : undefined);
  }
}
