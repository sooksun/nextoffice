import { Controller, Get, Post, Put, Param, Query, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { VaultSyncService } from '../services/vault-sync.service';
import { KnowledgeGraphService } from '../services/knowledge-graph.service';

@ApiTags('vault')
@Controller('vault')
export class VaultController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: VaultSyncService,
    private readonly graphService: KnowledgeGraphService,
  ) {}

  @Post('sync')
  @ApiOperation({ summary: 'Trigger vault sync for an organization' })
  async triggerSync(@Body() body: { organizationId: number }) {
    return this.syncService.syncAll(body.organizationId);
  }

  @Get('config/:organizationId')
  @ApiOperation({ summary: 'Get vault config for an organization' })
  async getConfig(@Param('organizationId', ParseIntPipe) organizationId: number) {
    const config = await this.prisma.knowledgeVaultConfig.findUnique({
      where: { organizationId: BigInt(organizationId) },
    });
    if (!config) {
      return { organizationId, vaultPath: '/vault', syncEnabled: false, autoGenerate: true, configJson: null, lastSyncAt: null };
    }
    return this.serializeConfig(config);
  }

  @Put('config/:organizationId')
  @ApiOperation({ summary: 'Update or create vault config for an organization' })
  async upsertConfig(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Body() body: {
      vaultPath?: string;
      syncEnabled?: boolean;
      autoGenerate?: boolean;
      configJson?: any;
    },
  ) {
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
  @ApiOperation({ summary: 'Get knowledge graph edges for visualization' })
  @ApiQuery({ name: 'organizationId', required: false, type: Number })
  async getGraph(@Query('organizationId') organizationId?: string) {
    return this.graphService.getGraph(
      organizationId ? Number(organizationId) : undefined,
    );
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
