import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';

@Injectable()
export class NoteGeneratorService {
  private readonly logger = new Logger(NoteGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiApiService,
  ) {}

  async generateFromCase(caseId: number, callerOrgId?: number) {
    const inboundCase = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: {
        organization: true,
        sourceDocument: true,
        topics: { include: { topic: true } },
        options: { include: { references: true } },
      },
    });
    if (!inboundCase) throw new NotFoundException(`Case #${caseId} not found`);
    if (callerOrgId && inboundCase.organizationId && Number(inboundCase.organizationId) !== callerOrgId) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
    }

    const topicTags = inboundCase.topics
      ?.map((t: any) => t.topic?.topicCode || t.topicCode)
      .filter(Boolean) || [];

    const prompt = this.buildCasePrompt(inboundCase, topicTags);
    const markdown = await this.callClaude(prompt);
    const folderPath = this.determineFolderPath('letter');

    const frontmatter = this.buildFrontmatter({
      noteType: 'letter',
      sourceType: 'inbound_case',
      sourceId: caseId,
      topicTags,
      title: inboundCase.title,
      organizationId: inboundCase.organizationId,
    });

    const note = await this.prisma.knowledgeNote.create({
      data: {
        organizationId: inboundCase.organizationId,
        noteType: 'letter',
        title: inboundCase.title,
        contentMd: markdown,
        frontmatterJson: JSON.stringify(frontmatter),
        folderPath,
        status: 'ai_draft',
        sourceType: 'inbound_case',
        sourceId: BigInt(caseId),
        confidence: 0.85,
      },
    });

    this.logger.log(`Generated note #${note.id} from case #${caseId}`);
    return this.serialize(note);
  }

  async generateFromAgenda(agendaId: number, _callerOrgId?: number) {
    const agenda = await this.prisma.horizonAgenda.findUnique({
      where: { id: BigInt(agendaId) },
      include: {
        documents: {
          include: { document: true },
        },
      },
    });
    if (!agenda) throw new NotFoundException(`Agenda #${agendaId} not found`);

    const topicTags = agenda.topicTags
      ? JSON.parse(agenda.topicTags)
      : [];

    const prompt = this.buildAgendaPrompt(agenda);
    const markdown = await this.callClaude(prompt);
    const folderPath = this.determineFolderPath('agenda');

    const frontmatter = this.buildFrontmatter({
      noteType: 'agenda',
      sourceType: 'horizon_agenda',
      sourceId: agendaId,
      topicTags,
      title: agenda.agendaTitle,
    });

    const note = await this.prisma.knowledgeNote.create({
      data: {
        noteType: 'agenda',
        title: agenda.agendaTitle,
        contentMd: markdown,
        frontmatterJson: JSON.stringify(frontmatter),
        folderPath,
        status: 'ai_draft',
        sourceType: 'horizon_agenda',
        sourceId: BigInt(agendaId),
        confidence: 0.80,
      },
    });

    this.logger.log(`Generated note #${note.id} from agenda #${agendaId}`);
    return this.serialize(note);
  }

  async generateFromProject(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: BigInt(projectId) },
      include: {
        organization: true,
        topics: true,
        documents: true,
        reports: true,
      },
    }) as any;
    if (!project) throw new NotFoundException(`Project #${projectId} not found`);

    const topicTags = project.topics?.map((t) => t.topicCode).filter(Boolean) || [];

    const prompt = this.buildProjectPrompt(project);
    const markdown = await this.callClaude(prompt);
    const folderPath = this.determineFolderPath('project');

    const frontmatter = this.buildFrontmatter({
      noteType: 'project',
      sourceType: 'project',
      sourceId: projectId,
      topicTags,
      title: project.name,
      organizationId: project.organizationId,
    });

    const note = await this.prisma.knowledgeNote.create({
      data: {
        organizationId: project.organizationId,
        noteType: 'project',
        title: project.name,
        contentMd: markdown,
        frontmatterJson: JSON.stringify(frontmatter),
        folderPath,
        status: 'ai_draft',
        sourceType: 'project',
        sourceId: BigInt(projectId),
        confidence: 0.80,
      },
    });

    this.logger.log(`Generated note #${note.id} from project #${projectId}`);
    return this.serialize(note);
  }

  determineFolderPath(noteType: string): string {
    const mapping: Record<string, string> = {
      policy: '01_Policies/',
      letter: '02_Official_Letters/',
      project: '03_Projects/',
      report: '04_Reports/',
      agenda: '05_Agendas/',
    };
    return mapping[noteType] || '99_Unsorted/';
  }

  buildFrontmatter(params: {
    noteType: string;
    sourceType: string;
    sourceId: number;
    topicTags: string[];
    title: string;
    organizationId?: bigint;
  }) {
    return {
      type: params.noteType,
      title: params.title,
      source_type: params.sourceType,
      source_id: params.sourceId,
      organization_id: params.organizationId ? Number(params.organizationId) : null,
      topic_tags: params.topicTags,
      status: 'ai_draft',
      created: new Date().toISOString().split('T')[0],
    };
  }

  private buildCasePrompt(inboundCase: any, topicTags: string[]): string {
    const optionsText = (inboundCase.options || [])
      .map((o) => `- ${o.optionCode}: ${o.title} — ${o.description || ''}`)
      .join('\n');

    return `สร้าง Knowledge Note ในรูปแบบ Markdown สำหรับหนังสือราชการ

ข้อมูลหนังสือ:
- เรื่อง: ${inboundCase.title}
- รายละเอียด: ${inboundCase.description || 'ไม่ระบุ'}
- หน่วยงาน: ${inboundCase.organization?.name || 'ไม่ระบุ'}
- ระดับความเร่งด่วน: ${inboundCase.urgencyLevel}
- หมวดหมู่: ${topicTags.join(', ') || 'ไม่ระบุ'}

ทางเลือกที่ AI เสนอ:
${optionsText || 'ไม่มี'}

กรุณาสร้าง Markdown note ที่มีโครงสร้าง:
1. สรุปสาระสำคัญ
2. ประเด็นที่ต้องดำเนินการ
3. กรอบเวลา/กำหนดส่ง
4. หน่วยงานที่เกี่ยวข้อง
5. ความเชื่อมโยงกับนโยบาย (ใส่ [[wikilinks]] ถ้ามี)

ตอบเป็น Markdown เท่านั้น ไม่ต้องมีคำอธิบายเพิ่มเติม`;
  }

  private buildAgendaPrompt(agenda: any): string {
    const docsText = (agenda.documents || [])
      .map((d) => `- ${d.document?.title || 'ไม่ระบุ'} (ความเชื่อมั่น: ${d.confidenceScore})`)
      .join('\n');

    return `สร้าง Knowledge Note ในรูปแบบ Markdown สำหรับวาระนโยบาย

ข้อมูลวาระ:
- ชื่อ: ${agenda.agendaTitle}
- รหัส: ${agenda.agendaCode}
- ประเภท: ${agenda.agendaType}
- ขอบเขต: ${agenda.agendaScope}
- หน่วยงานรับผิดชอบ: ${agenda.leadOrg || 'ไม่ระบุ'}
- สถานะ: ${agenda.currentStatus}
- สรุป: ${agenda.summaryText || 'ไม่ระบุ'}

เอกสารที่เกี่ยวข้อง:
${docsText || 'ไม่มี'}

กรุณาสร้าง Markdown note ที่มีโครงสร้าง:
1. สรุปวาระ
2. สัญญาณและแนวโน้ม (Signals)
3. เอกสารที่เกี่ยวข้อง
4. ผลกระทบต่อโรงเรียน (Implications)
5. ข้อเสนอแนะสำหรับสถานศึกษา
6. ความเชื่อมโยง (ใส่ [[wikilinks]] ถ้ามี)

ตอบเป็น Markdown เท่านั้น ไม่ต้องมีคำอธิบายเพิ่มเติม`;
  }

  private buildProjectPrompt(project: any): string {
    const reportsText = (project.reports || [])
      .map((r) => `- ${r.title || 'รายงาน'}: ${r.status}`)
      .join('\n');

    return `สร้าง Knowledge Note ในรูปแบบ Markdown สำหรับโครงการ

ข้อมูลโครงการ:
- ชื่อ: ${project.name}
- รายละเอียด: ${project.description || 'ไม่ระบุ'}
- หน่วยงาน: ${project.organization?.name || 'ไม่ระบุ'}
- สถานะ: ${project.status}
- วันเริ่ม: ${project.startDate || 'ไม่ระบุ'}
- วันสิ้นสุด: ${project.endDate || 'ไม่ระบุ'}
- งบประมาณ: ${project.budgetAmount || 'ไม่ระบุ'}

รายงาน:
${reportsText || 'ไม่มี'}

กรุณาสร้าง Markdown note ที่มีโครงสร้าง:
1. ภาพรวมโครงการ
2. วัตถุประสงค์
3. กิจกรรมหลัก
4. ผลที่คาดหวัง
5. งบประมาณ
6. ความเชื่อมโยงกับนโยบาย (ใส่ [[wikilinks]] ถ้ามี)

ตอบเป็น Markdown เท่านั้น ไม่ต้องมีคำอธิบายเพิ่มเติม`;
  }

  private async callClaude(prompt: string): Promise<string> {
    try {
      return await this.gemini.generateText({ user: prompt, maxOutputTokens: 4096 });
    } catch (err) {
      this.gemini.logAxiosError('NoteGenerator Gemini error', err);
      throw err;
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
