import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiQuery, ApiSecurity } from '@nestjs/swagger';
import { DifyToolsGuard } from './dify-tools.guard';
import { DifyToolsService } from './dify-tools.service';
import { DifyToolsAuditInterceptor } from './dify-tools-audit.interceptor';

/**
 * Phase 5: Read-only tools for Dify Agent custom tools.
 * Phase 6: audit interceptor + rate limit (in guard).
 * Auth: Bearer DIFY_TOOLS_API_KEY or X-Dify-Tool-Key (NOT user JWT).
 */
@ApiTags('dify-tools')
@ApiSecurity('dify-tool-key')
@ApiHeader({
  name: 'X-Dify-Tool-Key',
  required: false,
  description: 'Alternative to Authorization: Bearer <DIFY_TOOLS_API_KEY>',
})
@ApiHeader({
  name: 'X-Org-Id',
  required: false,
  description: 'Organization scope (must be allowlisted). Defaults to DIFY_TOOLS_ORG_ID.',
})
@UseGuards(DifyToolsGuard)
@UseInterceptors(DifyToolsAuditInterceptor)
@Controller('dify-tools')
export class DifyToolsController {
  constructor(private readonly tools: DifyToolsService) {}

  private orgId(req: any): number {
    return Number(req.difyTool.organizationId);
  }

  @Get('health')
  @HttpCode(200)
  @ApiOperation({ summary: 'Tool health + org scope (no secrets)' })
  health(@Req() req: any) {
    return {
      ok: true,
      organizationId: this.orgId(req),
      tools: [
        'search',
        'cases/:id',
        'cases',
        'outbound/:id',
        'registry/search',
      ],
      readOnly: true,
    };
  }

  @Get('search')
  @ApiOperation({ summary: 'Quick search cases + outbound (org-scoped)' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false })
  search(
    @Req() req: any,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.tools.search(this.orgId(req), q, limit ? Number(limit) : undefined);
  }

  @Get('cases/:id')
  @ApiOperation({ summary: 'Get inbound case detail (org-scoped, truncated text)' })
  getCase(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.tools.getCase(this.orgId(req), id);
  }

  @Get('cases')
  @ApiOperation({ summary: 'List recent inbound cases (org-scoped)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'urgency', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listCases(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('urgency') urgency?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tools.listCases(this.orgId(req), {
      status,
      urgency,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('outbound/:id')
  @ApiOperation({ summary: 'Get outbound document (org-scoped, body excerpt only)' })
  getOutbound(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.tools.getOutbound(this.orgId(req), id);
  }

  @Get('registry/search')
  @ApiOperation({ summary: 'Search document registry (org-scoped)' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false })
  searchRegistry(
    @Req() req: any,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.tools.searchRegistry(
      this.orgId(req),
      q,
      limit ? Number(limit) : undefined,
    );
  }
}
