import { Controller, Post, Get, Body, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DifyApiService } from './dify-api.service';

class DifyChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  query: string;

  /** Continue multi-turn chat in the same Dify conversation */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  conversationId?: string;

  /** Optional letter/case context injected as Dify inputs.letter_context */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  letterContext?: string;
}

@ApiTags('dify')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dify')
export class DifyController {
  constructor(private readonly dify: DifyApiService) {}

  @Get('status')
  @ApiOperation({ summary: 'Dify Phase-1 status (enabled / configured)' })
  status() {
    return this.dify.getStatus();
  }

  @Post('chat')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Phase 1: Ask Dify about official letters / school policy (Chat app)',
  })
  @ApiBody({
    schema: {
      example: {
        query: 'หนังสือราชการมีกี่ประเภท ตามระเบียบสารบรรณ?',
        conversationId: '',
        letterContext: '',
      },
    },
  })
  async chat(@Body() body: DifyChatDto, @CurrentUser() user: any) {
    const userKey = `user:${user?.id ?? 'anon'}:org:${user?.organizationId ?? 0}`;
    const inputs: Record<string, string> = {};
    if (body.letterContext?.trim()) {
      inputs.letter_context = body.letterContext.trim();
    }
    if (user?.organizationId) {
      inputs.org_id = String(user.organizationId);
    }

    const result = await this.dify.chat({
      query: body.query.trim(),
      user: userKey,
      conversationId: body.conversationId,
      inputs,
    });

    return {
      answer: result.answer,
      conversationId: result.conversationId,
      messageId: result.messageId,
      provider: result.provider,
    };
  }
}
