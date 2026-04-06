import { Controller, Get, Post, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { HorizonPipelineService } from '../services/horizon-pipeline.service';

@ApiTags('horizon-intelligence')
@Controller('horizon')
export class HorizonIntelligenceController {
  private readonly logger = new Logger(HorizonIntelligenceController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelineService: HorizonPipelineService,
  ) {}

  @Get('documents')
  @ApiOperation({ summary: 'List horizon documents with filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'contentType', required: false })
  @ApiQuery({ name: 'sourceId', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  async listDocuments(
    @Query('status') status?: string,
    @Query('contentType') contentType?: string,
    @Query('sourceId') sourceId?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const where: any = {};
    if (status) where.status = status;
    if (contentType) where.contentType = contentType;
    if (sourceId) where.sourceId = BigInt(sourceId);

    const [documents, total] = await Promise.all([
      this.prisma.horizonSourceDocument.findMany({
        where,
        include: {
          source: { select: { id: true, sourceCode: true, sourceName: true } },
          agendas: {
            include: { agenda: { select: { id: true, agendaCode: true, agendaTitle: true } } },
          },
          _count: { select: { signals: true, chunks: true } },
        },
        orderBy: { fetchedAt: 'desc' },
        take: take ? Number(take) : 50,
        skip: skip ? Number(skip) : 0,
      }),
      this.prisma.horizonSourceDocument.count({ where }),
    ]);

    return {
      total,
      data: documents.map((d) => this.serializeDocument(d)),
    };
  }

  @Get('agendas')
  @ApiOperation({ summary: 'List horizon agendas with filters' })
  @ApiQuery({ name: 'currentStatus', required: false })
  @ApiQuery({ name: 'agendaType', required: false })
  @ApiQuery({ name: 'agendaScope', required: false })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  async listAgendas(
    @Query('currentStatus') currentStatus?: string,
    @Query('agendaType') agendaType?: string,
    @Query('agendaScope') agendaScope?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const where: any = {};
    if (currentStatus) where.currentStatus = currentStatus;
    if (agendaType) where.agendaType = agendaType;
    if (agendaScope) where.agendaScope = agendaScope;

    const [agendas, total] = await Promise.all([
      this.prisma.horizonAgenda.findMany({
        where,
        include: {
          _count: { select: { documents: true, recommendations: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: take ? Number(take) : 50,
        skip: skip ? Number(skip) : 0,
      }),
      this.prisma.horizonAgenda.count({ where }),
    ]);

    return {
      total,
      data: agendas.map((a) => this.serializeAgenda(a)),
    };
  }

  @Get('signals')
  @ApiOperation({ summary: 'List horizon signals with filters' })
  @ApiQuery({ name: 'signalType', required: false })
  @ApiQuery({ name: 'actionabilityLevel', required: false })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  async listSignals(
    @Query('signalType') signalType?: string,
    @Query('actionabilityLevel') actionabilityLevel?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const where: any = {};
    if (signalType) where.signalType = signalType;
    if (actionabilityLevel) where.actionabilityLevel = actionabilityLevel;

    const [signals, total] = await Promise.all([
      this.prisma.horizonSignal.findMany({
        where,
        include: {
          document: {
            select: { id: true, title: true, contentType: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: take ? Number(take) : 50,
        skip: skip ? Number(skip) : 0,
      }),
      this.prisma.horizonSignal.count({ where }),
    ]);

    return {
      total,
      data: signals.map((s) => this.serializeSignal(s)),
    };
  }

  @Post('pipeline/run')
  @ApiOperation({ summary: 'Trigger full horizon pipeline for all active sources' })
  async runPipeline() {
    this.logger.log('Full pipeline run triggered');
    return this.pipelineService.runAll();
  }

  private serializeDocument(d: any) {
    return {
      ...d,
      id: Number(d.id),
      sourceId: Number(d.sourceId),
      qualityScore: d.qualityScore ? Number(d.qualityScore) : null,
      source: d.source
        ? { ...d.source, id: Number(d.source.id) }
        : null,
      agendas: d.agendas?.map((da: any) => ({
        ...da,
        id: Number(da.id),
        horizonDocumentId: Number(da.horizonDocumentId),
        horizonAgendaId: Number(da.horizonAgendaId),
        confidenceScore: da.confidenceScore ? Number(da.confidenceScore) : null,
        agenda: da.agenda
          ? { ...da.agenda, id: Number(da.agenda.id) }
          : null,
      })),
    };
  }

  private serializeAgenda(a: any) {
    return {
      ...a,
      id: Number(a.id),
      priorityScore: a.priorityScore ? Number(a.priorityScore) : null,
      momentumScore: a.momentumScore ? Number(a.momentumScore) : null,
    };
  }

  private serializeSignal(s: any) {
    return {
      ...s,
      id: Number(s.id),
      horizonDocumentId: Number(s.horizonDocumentId),
      document: s.document
        ? { ...s.document, id: Number(s.document.id) }
        : null,
    };
  }
}
