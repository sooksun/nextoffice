import {
  Controller,
  Get,
  Post,
  Query,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DifyApiService } from './dify-api.service';
import { DifyAuditService, DifyAuditKind } from './dify-audit.service';
import { ConfigService } from '@nestjs/config';

/**
 * Phase 6: Admin observability for Dify integration (JWT ADMIN/DIRECTOR).
 * Never returns full API keys.
 */
@ApiTags('dify-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DIRECTOR')
@Controller('dify/admin')
export class DifyAdminController {
  constructor(
    private readonly dify: DifyApiService,
    private readonly audit: DifyAuditService,
    private readonly config: ConfigService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Dify integration overview (no secrets)' })
  overview() {
    const status = this.dify.getStatus({ fresh: true });
    const toolsKey = this.config.get<string>('DIFY_TOOLS_API_KEY')?.trim() || '';
    return {
      ...status,
      ops: {
        toolsRateLimit: Number(this.config.get('DIFY_TOOLS_RATE_LIMIT') ?? 60),
        toolsRateWindowMs: Number(this.config.get('DIFY_TOOLS_RATE_WINDOW_MS') ?? 60_000),
        toolsIpAllowlistConfigured: !!(
          this.config.get<string>('DIFY_TOOLS_IP_ALLOWLIST')?.trim()
        ),
        toolsKeyFingerprint: toolsKey
          ? `${toolsKey.slice(0, 4)}…${toolsKey.slice(-4)} (len=${toolsKey.length})`
          : null,
        chatKeyConfigured: status.apps?.chat ?? false,
        workflowKeyConfigured: status.apps?.workflow ?? false,
        outlineKeyConfigured: status.apps?.outboundOutline ?? false,
      },
      audit: this.audit.stats(),
      docs: [
        'docs/dify/PHASE1-SETUP.md',
        'docs/dify/PHASE5-SETUP.md',
        'docs/dify/PHASE6-SETUP.md',
      ],
    };
  }

  @Get('audit')
  @ApiOperation({ summary: 'Recent Dify/tool audit events (in-memory)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({
    name: 'kind',
    required: false,
    enum: ['tool', 'chat', 'workflow', 'completion', 'outbound_outline', 'admin'],
  })
  listAudit(
    @Query('limit') limit?: string,
    @Query('kind') kind?: string,
  ) {
    const k = kind as DifyAuditKind | undefined;
    return {
      events: this.audit.list({
        limit: limit ? Number(limit) : 50,
        kind: k && ['tool', 'chat', 'workflow', 'completion', 'outbound_outline', 'admin'].includes(k)
          ? k
          : undefined,
      }),
      stats: this.audit.stats(),
    };
  }

  @Post('audit/clear')
  @HttpCode(200)
  @ApiOperation({ summary: 'Clear in-memory audit buffer (ADMIN/DIRECTOR)' })
  clearAudit() {
    const result = this.audit.clear();
    this.audit.record({
      kind: 'admin',
      action: 'audit.clear',
      ok: true,
      detail: `cleared=${result.cleared}`,
    });
    return result;
  }
}
