import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DifyApiService, DifyAppKind } from './dify-api.service';
import { DifyContextService } from './dify-context.service';
import { DifyChatDto, DifyWorkflowRunDto, DifyCompletionDto } from './dify.dto';

@ApiTags('dify')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dify')
export class DifyController {
  constructor(
    private readonly dify: DifyApiService,
    private readonly context: DifyContextService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Dify status (enabled, apps, cache) — Phase 2' })
  @ApiQuery({ name: 'fresh', required: false, description: 'Bypass 30s status cache' })
  status(@Query('fresh') fresh?: string) {
    return this.dify.getStatus({ fresh: fresh === '1' || fresh === 'true' });
  }

  @Get('parameters')
  @ApiOperation({ summary: 'Proxy Dify GET /parameters for configured app' })
  @ApiQuery({
    name: 'app',
    required: false,
    enum: ['chat', 'workflow', 'completion'],
    description: 'Which API key to use (default chat)',
  })
  parameters(@Query('app') app?: string) {
    const kind = this.parseAppKind(app);
    return this.dify.getParameters(kind);
  }

  @Post('chat')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Chat with Dify policy/letter app. Optional caseId loads org-scoped case summary into letter_context.',
  })
  @ApiBody({
    schema: {
      example: {
        query: 'หนังสือฉบับนี้ต้องตอบหรือไม่?',
        conversationId: '',
        letterContext: '',
        caseId: 42,
      },
    },
  })
  async chat(@Body() body: DifyChatDto, @CurrentUser() user: any) {
    const userKey = this.userKey(user);
    const orgId = user?.organizationId ? Number(user.organizationId) : undefined;

    let letterContext = body.letterContext?.trim() || '';
    if (body.caseId) {
      const fromCase = await this.context.buildCaseLetterContext(
        body.caseId,
        orgId,
        user?.roleCode,
      );
      letterContext = letterContext
        ? `${fromCase}\n\n--- เพิ่มเติมจากผู้ใช้ ---\n${letterContext}`
        : fromCase;
    }

    const inputs: Record<string, string> = {};
    if (letterContext) inputs.letter_context = letterContext;
    if (orgId) inputs.org_id = String(orgId);
    if (body.caseId) inputs.case_id = String(body.caseId);

    const result = await this.dify.chat({
      query: body.query.trim(),
      user: userKey,
      conversationId: body.conversationId,
      inputs,
      organizationId: orgId,
      skipCache: body.skipCache === true || !!body.caseId || !!body.letterContext,
    });

    return {
      answer: result.answer,
      conversationId: result.conversationId,
      messageId: result.messageId,
      provider: result.provider,
      cached: result.cached ?? false,
      latencyMs: result.latencyMs,
      caseId: body.caseId ?? null,
      hasLetterContext: !!letterContext,
    };
  }

  @Post('workflows/run')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Run a Dify Workflow app (blocking). Requires DIFY_API_KEY_WORKFLOW.',
  })
  @ApiBody({
    schema: {
      example: {
        inputs: { query: 'สรุปขั้นตอนลงรับหนังสือด่วน', org_name: 'โรงเรียนตัวอย่าง' },
      },
    },
  })
  async runWorkflow(@Body() body: DifyWorkflowRunDto, @CurrentUser() user: any) {
    const userKey = body.user?.trim() || this.userKey(user);
    const inputs: Record<string, string | number | boolean> = {
      ...(body.inputs ?? {}),
    };
    if (user?.organizationId && inputs.org_id === undefined) {
      inputs.org_id = String(user.organizationId);
    }

    const result = await this.dify.runWorkflow({ inputs, user: userKey });
    return {
      workflowRunId: result.workflowRunId,
      taskId: result.taskId,
      status: result.status,
      outputs: result.outputs,
      text: result.text,
      provider: result.provider,
      latencyMs: result.latencyMs,
    };
  }

  @Post('completion')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Dify Text Generator / completion app. Requires DIFY_API_KEY_COMPLETION.',
  })
  async completion(@Body() body: DifyCompletionDto, @CurrentUser() user: any) {
    const userKey = body.user?.trim() || this.userKey(user);
    const result = await this.dify.completion({
      inputs: body.inputs ?? {},
      user: userKey,
    });
    return {
      answer: result.answer,
      messageId: result.messageId,
      provider: result.provider,
      latencyMs: result.latencyMs,
    };
  }

  private userKey(user: any): string {
    return `user:${user?.id ?? 'anon'}:org:${user?.organizationId ?? 0}`;
  }

  private parseAppKind(app?: string): DifyAppKind {
    if (app === 'workflow' || app === 'completion' || app === 'chat') return app;
    return 'chat';
  }
}
