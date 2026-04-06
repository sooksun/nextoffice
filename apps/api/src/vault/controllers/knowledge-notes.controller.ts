import { Controller, Get, Post, Param, Query, ParseIntPipe, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { NoteGeneratorService } from '../services/note-generator.service';
import { KnowledgeGraphService } from '../services/knowledge-graph.service';

@ApiTags('vault/notes')
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
  @ApiQuery({ name: 'organizationId', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  async listNotes(
    @Query('noteType') noteType?: string,
    @Query('status') status?: string,
    @Query('organizationId') organizationId?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const where: any = {};
    if (noteType) where.noteType = noteType;
    if (status) where.status = status;
    if (organizationId) where.organizationId = BigInt(Number(organizationId));

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
  async getNote(@Param('id', ParseIntPipe) id: number) {
    const note = await this.prisma.knowledgeNote.findUnique({
      where: { id: BigInt(id) },
    });
    if (!note) throw new NotFoundException(`Note #${id} not found`);
    return this.serialize(note);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Mark note as reviewed' })
  async reviewNote(@Param('id', ParseIntPipe) id: number) {
    const note = await this.prisma.knowledgeNote.update({
      where: { id: BigInt(id) },
      data: { status: 'reviewed' },
    });
    return this.serialize(note);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Mark note as published' })
  async publishNote(@Param('id', ParseIntPipe) id: number) {
    const note = await this.prisma.knowledgeNote.update({
      where: { id: BigInt(id) },
      data: { status: 'published' },
    });
    return this.serialize(note);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Mark note as archived' })
  async archiveNote(@Param('id', ParseIntPipe) id: number) {
    const note = await this.prisma.knowledgeNote.update({
      where: { id: BigInt(id) },
      data: { status: 'archived' },
    });
    return this.serialize(note);
  }

  @Post('generate/case/:caseId')
  @ApiOperation({ summary: 'Generate knowledge note from an InboundCase' })
  async generateFromCase(@Param('caseId', ParseIntPipe) caseId: number) {
    return this.noteGenerator.generateFromCase(caseId);
  }

  @Post('generate/agenda/:agendaId')
  @ApiOperation({ summary: 'Generate knowledge note from a HorizonAgenda' })
  async generateFromAgenda(@Param('agendaId', ParseIntPipe) agendaId: number) {
    return this.noteGenerator.generateFromAgenda(agendaId);
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
