import { Controller, Get, Post, Param, Query, ParseIntPipe, NotFoundException, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { NoteGeneratorService } from '../services/note-generator.service';
import { KnowledgeGraphService } from '../services/knowledge-graph.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('vault/notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vault/notes')
export class KnowledgeNotesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly noteGenerator: NoteGeneratorService,
    private readonly knowledgeGraph: KnowledgeGraphService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List knowledge notes with filters' })
  @ApiQuery({ name: 'noteType', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  async listNotes(
    @CurrentUser() user: any,
    @Query('noteType') noteType?: string,
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const where: any = { organizationId: BigInt(Number(user.organizationId)) };
    if (noteType) where.noteType = noteType;
    if (status) where.status = status;

    const [notes, total] = await Promise.all([
      this.prisma.knowledgeNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: take ? Number(take) : 50,
        skip: skip ? Number(skip) : 0,
      }),
      this.prisma.knowledgeNote.count({ where }),
    ]);

    return { total, data: notes.map((n) => this.serialize(n)) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get knowledge note detail with Markdown content' })
  async getNote(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    const note = await this.prisma.knowledgeNote.findUnique({
      where: { id: BigInt(id) },
    });
    if (!note) throw new NotFoundException(`Note #${id} not found`);
    if (note.organizationId && Number(note.organizationId) !== Number(user.organizationId)) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
    }
    return this.serialize(note);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Mark note as reviewed' })
  async reviewNote(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    await this.assertNoteOwnership(id, user);
    const note = await this.prisma.knowledgeNote.update({
      where: { id: BigInt(id) },
      data: { status: 'reviewed' },
    });
    return this.serialize(note);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Mark note as published' })
  async publishNote(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    await this.assertNoteOwnership(id, user);
    const note = await this.prisma.knowledgeNote.update({
      where: { id: BigInt(id) },
      data: { status: 'published' },
    });
    return this.serialize(note);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Mark note as archived' })
  async archiveNote(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    await this.assertNoteOwnership(id, user);
    const note = await this.prisma.knowledgeNote.update({
      where: { id: BigInt(id) },
      data: { status: 'archived' },
    });
    return this.serialize(note);
  }

  @Post('generate/case/:caseId')
  @ApiOperation({ summary: 'Generate knowledge note from an InboundCase' })
  async generateFromCase(@Param('caseId', ParseIntPipe) caseId: number, @CurrentUser() user: any) {
    return this.noteGenerator.generateFromCase(caseId, Number(user.organizationId));
  }

  @Post('batch-generate')
  @ApiOperation({ summary: 'Generate notes for all eligible cases/agendas in org (skips ones with existing notes)' })
  async batchGenerate(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    const orgId = Number(user.organizationId);
    const maxBatch = Math.min(Number(limit) || 20, 50);

    // Find cases in org that don't yet have a knowledge note
    const existing = await this.prisma.knowledgeNote.findMany({
      where: { organizationId: BigInt(orgId), sourceType: 'inbound_case' },
      select: { sourceId: true },
    });
    const doneIds = new Set(existing.map((n) => n.sourceId?.toString()).filter(Boolean));

    const cases = await this.prisma.inboundCase.findMany({
      where: {
        organizationId: BigInt(orgId),
        status: { in: ['registered', 'assigned', 'in_progress', 'completed'] },
      },
      orderBy: { createdAt: 'desc' },
      take: maxBatch * 2,
      select: { id: true, title: true },
    });

    const eligible = cases.filter((c) => !doneIds.has(c.id.toString())).slice(0, maxBatch);

    let generated = 0;
    const failures: Array<{ caseId: number; error: string }> = [];

    for (const c of eligible) {
      try {
        await this.noteGenerator.generateFromCase(Number(c.id), orgId);
        generated++;
      } catch (err: any) {
        failures.push({ caseId: Number(c.id), error: err?.message ?? String(err) });
      }
    }

    return {
      orgId,
      candidateCount: eligible.length,
      totalCases: cases.length,
      alreadyGenerated: doneIds.size,
      generated,
      failures,
    };
  }

  @Post('generate/agenda/:agendaId')
  @ApiOperation({ summary: 'Generate knowledge note from a HorizonAgenda' })
  async generateFromAgenda(@Param('agendaId', ParseIntPipe) agendaId: number, @CurrentUser() user: any) {
    return this.noteGenerator.generateFromAgenda(agendaId, Number(user.organizationId));
  }

  private async assertNoteOwnership(id: number, user: any) {
    const note = await this.prisma.knowledgeNote.findUnique({
      where: { id: BigInt(id) },
      select: { organizationId: true },
    });
    if (!note) throw new NotFoundException(`Note #${id} not found`);
    if (note.organizationId && Number(note.organizationId) !== Number(user.organizationId)) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
    }
  }

  private serialize(note: any) {
    return {
      ...note,
      id: Number(note.id),
      organizationId: note.organizationId ? Number(note.organizationId) : null,
      sourceId: note.sourceId ? Number(note.sourceId) : null,
      confidence: note.confidence ? Number(note.confidence) : null,
      linkedNotes: note.linkedNotes ? JSON.parse(note.linkedNotes) : [],
      frontmatterJson: note.frontmatterJson ? JSON.parse(note.frontmatterJson) : null,
    };
  }
}
