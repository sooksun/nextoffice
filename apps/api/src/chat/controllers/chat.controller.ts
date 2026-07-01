import { Controller, Post, Get, Body, Query, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsNumber, ValidateNested, IsArray, IsIn, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ChatService } from '../services/chat.service';
import { ChatFeedbackService } from '../services/chat-feedback.service';
import { DocumentIntentService } from '../services/document-intent.service';
import { DocumentDraftService, AutoFillContext } from '../services/document-draft.service';
import { looksLikeDocumentRequest, isSupportedDocType } from '../document/document-spec';
import { QueryCacheService } from '../../rag/services/query-cache.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
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
    private readonly queryCache: QueryCacheService,
    private readonly documentIntent: DocumentIntentService,
    private readonly documentDraft: DocumentDraftService,
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

  @Post('compose')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Unified chat entry — แยกเจตนา (ask vs สร้างเอกสาร). ถ้าเป็นคำถาม → RAG เดิม; ถ้าสั่งสร้างใบลา/ไปราชการ → สร้าง draft + คืน missingFields',
  })
  @ApiBody({
    schema: {
      example: {
        query: 'ขอลาป่วย 2 วัน เริ่มพรุ่งนี้',
        pageContext: { route: '/director' },
      },
    },
  })
  async compose(@Body() body: ChatMessageDto, @CurrentUser() user: any) {
    const now = new Date();

    // Keyword gate — คำถามทั่วไปข้ามไป RAG ทันที (ไม่เสีย latency กับ LLM classify)
    if (!looksLikeDocumentRequest(body.query)) {
      return this.asAnswer(await this.runRag(body, user));
    }

    const classified = await this.documentIntent.classify(body.query, now);
    if (classified.intent !== 'create_document') {
      return this.asAnswer(await this.runRag(body, user));
    }

    if (!isSupportedDocType(classified.docType)) {
      return {
        kind: 'document_unsupported' as const,
        message:
          'ขออภัย ตอนนี้ผมช่วยร่างให้ได้เฉพาะ "ใบลา" และ "ใบขออนุญาตไปราชการ" ครับ ' +
          'ลองพิมพ์เช่น "ขอลาป่วย 2 วัน เริ่มพรุ่งนี้" หรือ "ขอไปราชการที่ สพป. วันที่ 10"',
      };
    }

    const ctx = this.buildAutoFillContext(user);
    if (ctx.organizationId == null) {
      return {
        kind: 'document_unsupported' as const,
        message:
          'บัญชีของคุณยังไม่ได้ผูกกับหน่วยงาน จึงยังสร้างเอกสารให้ไม่ได้ กรุณาติดต่อผู้ดูแลระบบ',
      };
    }

    return this.documentDraft.build(classified.docType, classified.fields, ctx, now);
  }

  private runRag(body: ChatMessageDto, user: any) {
    return this.chatService.chat(
      body.query,
      body.pageContext,
      user?.id ? Number(user.id) : undefined,
      body.history ?? [],
    );
  }

  private asAnswer(resp: Awaited<ReturnType<ChatService['chat']>>) {
    return { kind: 'answer' as const, ...resp };
  }

  /** ดึงข้อมูลผู้ใช้ปัจจุบันจาก JWT (request.user = raw Prisma user + organization) */
  private buildAutoFillContext(user: any): AutoFillContext {
    const org = user?.organization;
    return {
      userId: Number(user.id),
      organizationId: user?.organizationId != null ? Number(user.organizationId) : null,
      fullName: user?.fullName ?? '',
      positionTitle: user?.positionTitle ?? null,
      phone: user?.phone ?? null,
      org: org
        ? {
            name: org.name ?? null,
            address: org.address ?? null,
            province: org.province ?? null,
            district: org.district ?? null,
            phone: org.phone ?? null,
          }
        : null,
    };
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

  // ── Admin analytics (ADMIN/DIRECTOR only) ─────────────────────────

  @Get('admin/overview')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: 'Chat analytics overview — feedback + cache stats' })
  @ApiQuery({ name: 'days', required: false, description: 'Rolling window in days (default 30)' })
  async adminOverview(@Query('days') days?: string) {
    const rangeDays = Number(days) || 30;
    const [feedback, cache] = await Promise.all([
      this.feedbackService.stats(rangeDays),
      this.queryCache.stats(),
    ]);
    return { feedback, cache };
  }

  @Get('admin/feedback/top-negative')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: 'Top 👎 queries — candidates for expanding KB' })
  adminTopNegative(@Query('days') days?: string, @Query('limit') limit?: string) {
    return this.feedbackService.topNegativeQueries(Number(days) || 30, Number(limit) || 20);
  }

  @Get('admin/feedback/by-page')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: 'Satisfaction rate broken down per page route' })
  adminStatsByPage(@Query('days') days?: string) {
    return this.feedbackService.statsByPage(Number(days) || 30, 3);
  }

  @Get('admin/feedback/recent')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: 'Recent feedback entries (latest first)' })
  adminRecentFeedback(@Query('limit') limit?: string) {
    return this.feedbackService.recent(Number(limit) || 30);
  }
}
