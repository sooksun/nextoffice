import { Controller, Get, Post, Put, Param, Query, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { VaultSyncService } from '../services/vault-sync.service';
import { KnowledgeGraphService } from '../services/knowledge-graph.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('vault')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vault')
export class VaultController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: VaultSyncService,
    private readonly graphService: KnowledgeGraphService,
  ) {}

  @Post('sync')
  @ApiOperation({ summary: 'Trigger vault sync for an organization' })
  async triggerSync(@CurrentUser() user: any) {
    return this.syncService.syncAll(Number(user.organizationId));
  }

  @Get('config')
  @ApiOperation({ summary: 'Get vault config for current organization' })
  async getConfig(@CurrentUser() user: any) {
    const organizationId = Number(user.organizationId);
    const config = await this.prisma.knowledgeVaultConfig.findUnique({
      where: { organizationId: BigInt(organizationId) },
    });
    if (!config) {
      return { organizationId, vaultPath: '/vault', syncEnabled: false, autoGenerate: true, configJson: null, lastSyncAt: null };
    }
    return this.serializeConfig(config);
  }

  @Put('config')
  @ApiOperation({ summary: 'Update or create vault config for current organization' })
  async upsertConfig(
    @CurrentUser() user: any,
    @Body() body: {
      vaultPath?: string;
      syncEnabled?: boolean;
      autoGenerate?: boolean;
      configJson?: any;
    },
  ) {
    const organizationId = Number(user.organizationId);
    const data: any = {};
    if (body.vaultPath !== undefined) data.vaultPath = body.vaultPath;
    if (body.syncEnabled !== undefined) data.syncEnabled = body.syncEnabled;
    if (body.autoGenerate !== undefined) data.autoGenerate = body.autoGenerate;
    if (body.configJson !== undefined) {
      data.configJson = typeof body.configJson === 'string'
        ? body.configJson
        : JSON.stringify(body.configJson);
    }

    const config = await this.prisma.knowledgeVaultConfig.upsert({
      where: { organizationId: BigInt(organizationId) },
      create: {
        organizationId: BigInt(organizationId),
        vaultPath: body.vaultPath || '/vault',
        syncEnabled: body.syncEnabled ?? false,
        autoGenerate: body.autoGenerate ?? true,
        configJson: data.configJson || null,
      },
      update: data,
    });

    return this.serializeConfig(config);
  }

  @Get('graph')
  @ApiOperation({ summary: 'Get knowledge graph edges for current organization' })
  async getGraph(@CurrentUser() user: any) {
    return this.graphService.getGraph(Number(user.organizationId));
  }

  private serializeConfig(config: any) {
    return {
      ...config,
      id: Number(config.id),
      organizationId: Number(config.organizationId),
      configJson: config.configJson ? JSON.parse(config.configJson) : null,
    };
  }
}
