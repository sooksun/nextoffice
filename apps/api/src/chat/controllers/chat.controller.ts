import { Controller, Post, Body, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsNumber, ValidateNested, IsArray, IsIn, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ChatService } from '../services/chat.service';
import { ChatFeedbackService } from '../services/chat-feedback.service';
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

class ChatHistoryTurnDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content: string;
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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryTurnDto)
  history?: ChatHistoryTurnDto[];
}

class ChatFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  queryId: string;

  @IsIn(['up', 'down'])
  rating: 'up' | 'down';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  userQuery?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  assistantAnswer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pageRoute?: string;

  @IsOptional()
  @IsNumber()
  pageEntityId?: number;
}

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly feedbackService: ChatFeedbackService,
  ) {}

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
    return this.chatService.chat(
      body.query,
      body.pageContext,
      user?.id ? Number(user.id) : undefined,
      body.history ?? [],
    );
  }

  @Post('feedback')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit 👍/👎 feedback on an assistant answer' })
  feedback(@Body() body: ChatFeedbackDto, @CurrentUser() user: any) {
    return this.feedbackService.submit({
      queryId: body.queryId,
      userId: user?.id ? Number(user.id) : null,
      rating: body.rating,
      comment: body.comment,
      userQuery: body.userQuery,
      assistantAnswer: body.assistantAnswer,
      pageRoute: body.pageRoute,
      pageEntityId: body.pageEntityId ?? null,
    });
  }
}
