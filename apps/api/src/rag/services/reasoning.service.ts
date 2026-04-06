import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RetrievalService } from './retrieval.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';
import { SystemPromptsService } from '../../system-prompts/system-prompts.service';

@Injectable()
export class ReasoningService {
  private readonly logger = new Logger(ReasoningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly gemini: GeminiApiService,
    private readonly prompts: SystemPromptsService,
  ) {}

  async generateCaseOptions(caseId: bigint, orgId: bigint, query: string): Promise<void> {
    const results = await this.retrieval.retrieve(caseId, query, orgId);

    const horizonItems = results.filter((r) => r.sourceType === 'horizon').slice(0, 3);
    const policyItems = results.filter((r) => r.sourceType === 'policy').slice(0, 3);

    const enhancedCtx = await this.getEnhancedContext(caseId, orgId);

    let options: any[];

    if (this.gemini.getApiKey()) {
      options = await this.generateOptionsWithLLM(query, horizonItems, policyItems, enhancedCtx);
    } else {
      options = this.generateFallbackOptions(query);
    }

    for (const opt of options) {
      const caseOption = await this.prisma.caseOption.create({
        data: {
          inboundCaseId: caseId,
          optionCode: opt.code,
          title: opt.title,
          description: opt.description,
          implementationSteps: opt.implementationSteps,
          expectedBenefits: opt.expectedBenefits,
          risks: opt.risks,
          policyComplianceNote: opt.policyComplianceNote,
          contextFitNote: opt.contextFitNote,
          feasibilityScore: opt.feasibilityScore,
          innovationScore: opt.innovationScore,
          complianceScore: opt.complianceScore,
          overallScore: opt.overallScore,
        },
      });

      // Save references
      for (const h of horizonItems.slice(0, 2)) {
        await this.prisma.caseOptionReference.create({
          data: {
            caseOptionId: caseOption.id,
            referenceType: 'horizon',
            sourceRecordId: h.sourceRecordId,
            citationText: h.rationale,
            contributionNote: `ใช้สนับสนุนทางเลือก ${opt.code}`,
          },
        });
      }
    }

    await this.prisma.inboundCase.update({
      where: { id: caseId },
      data: { status: 'proposed' },
    });

    this.logger.log(`Generated ${options.length} case options for case ${caseId}`);
  }

  private async generateOptionsWithLLM(
    query: string,
    horizonItems: any[],
    policyItems: any[],
    enhancedCtx?: { horizonInsights: string; projectContext: string; workflowSuggestion: string },
  ): Promise<any[]> {
    const horizonContext = horizonItems
      .map((h) => `- ${h.data?.title || h.rationale}`)
      .join('\n');
    const policyContext = policyItems
      .map((p) => `- ${p.data?.title || p.rationale}`)
      .join('\n');

    const cfg = await this.prompts.get('reasoning.options');
    let prompt = cfg.promptText
      .replace('{{query}}', query)
      .replace('{{horizon_context}}', horizonContext || 'ไม่มีข้อมูล')
      .replace('{{policy_context}}', policyContext || 'ไม่มีข้อมูล');

    if (enhancedCtx) {
      prompt += `\n\n--- บริบทเพิ่มเติม ---\nวาระนโยบายที่เกี่ยวข้อง:\n${enhancedCtx.horizonInsights}\nโครงการโรงเรียนที่เกี่ยวข้อง:\n${enhancedCtx.projectContext}\nรูปแบบการทำงานที่เรียนรู้:\n${enhancedCtx.workflowSuggestion}`;
    }

    try {
      const rawText =
        (await this.gemini.generateText({
          user: prompt,
          maxOutputTokens: cfg.maxTokens,
          temperature: cfg.temperature,
        })) || '[]';
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      return JSON.parse(jsonMatch?.[0] || '[]');
    } catch (err) {
      this.logger.error(`LLM option generation failed: ${err.message}`);
      return this.generateFallbackOptions(query);
    }
  }

  async getEnhancedContext(
    caseId: bigint,
    orgId: bigint,
  ): Promise<{
    horizonInsights: string;
    projectContext: string;
    workflowSuggestion: string;
  }> {
    const caseTopics = await this.prisma.caseTopic.findMany({
      where: { inboundCaseId: caseId },
      include: { topic: true },
    });
    const topicCodes = caseTopics.map((t) => t.topic.topicCode);

    const agendas = await this.prisma.horizonAgenda.findMany({
      where: { currentStatus: { in: ['active', 'peak'] } },
      take: 3,
      orderBy: { priorityScore: 'desc' },
    });

    const matchedAgendas = agendas.filter((a) => {
      const tags = a.topicTags ? JSON.parse(a.topicTags) : [];
      return topicCodes.some((t) => tags.includes(t));
    });

    const horizonInsights =
      matchedAgendas.length > 0
        ? matchedAgendas
            .map((a) => `- ${a.agendaTitle} (priority: ${a.priorityScore})`)
            .join('\n')
        : 'ไม่มีวาระนโยบายที่เกี่ยวข้อง';

    const projects = await this.prisma.project.findMany({
      where: { organizationId: orgId, status: 'active' },
      include: { topics: true },
    });

    const matchedProjects = projects.filter((p) =>
      p.topics.some((t) => topicCodes.includes(t.topicCode)),
    );

    const projectContext =
      matchedProjects.length > 0
        ? matchedProjects.map((p) => `- ${p.name} (${p.status})`).join('\n')
        : 'ไม่มีโครงการที่เกี่ยวข้อง';

    const patterns = await this.prisma.workflowPattern.findMany({
      where: { organizationId: orgId },
      orderBy: { sampleCount: 'desc' },
      take: 3,
    });

    const workflowSuggestion =
      patterns.length > 0
        ? patterns
            .map(
              (p) =>
                `- ${p.documentType}/${p.topicCode} → ${p.routedToGroup || 'ไม่ระบุ'} (${p.sampleCount} ครั้ง, avg ${p.avgProcessDays} วัน)`,
            )
            .join('\n')
        : 'ไม่มีรูปแบบที่เรียนรู้';

    return { horizonInsights, projectContext, workflowSuggestion };
  }

  private generateFallbackOptions(query: string): any[] {
    return [
      {
        code: 'A',
        title: 'ทางเลือกที่ปลอดภัย',
        description: `ดำเนินการตาม policy มาตรฐาน: ${query}`,
        implementationSteps: '1. ศึกษากฎระเบียบ 2. วางแผน 3. ดำเนินการ',
        expectedBenefits: 'ปลอดภัย ไม่ขัดระเบียบ',
        risks: 'อาจช้ากว่าที่ควร',
        policyComplianceNote: 'สอดคล้องกับระเบียบทุกข้อ',
        contextFitNote: 'เหมาะกับทุกบริบท',
        feasibilityScore: 0.9,
        innovationScore: 0.3,
        complianceScore: 0.95,
        overallScore: 0.72,
      },
      {
        code: 'B',
        title: 'ทางเลือกสมดุล',
        description: `ดัดแปลงแนวทางที่เหมาะสม: ${query}`,
        implementationSteps: '1. วิเคราะห์บริบท 2. ปรับแผน 3. ดำเนินการ 4. ประเมินผล',
        expectedBenefits: 'สมดุลระหว่างประสิทธิภาพและความปลอดภัย',
        risks: 'ต้องการทรัพยากรมากกว่าแบบ A',
        policyComplianceNote: 'สอดคล้องกับระเบียบหลัก',
        contextFitNote: 'เหมาะกับบริบทที่มีทรัพยากรปานกลาง',
        feasibilityScore: 0.75,
        innovationScore: 0.6,
        complianceScore: 0.85,
        overallScore: 0.73,
      },
      {
        code: 'C',
        title: 'ทางเลือกนวัตกรรม',
        description: `ใช้แนวทางใหม่ที่ทันสมัย: ${query}`,
        implementationSteps: '1. นำร่อง 2. ประเมิน 3. ขยายผล',
        expectedBenefits: 'ผลลัพธ์ดีกว่าในระยะยาว',
        risks: 'ความเสี่ยงสูงกว่า ต้องการทักษะเฉพาะ',
        policyComplianceNote: 'อาจต้องขอยกเว้นบางข้อ',
        contextFitNote: 'เหมาะกับองค์กรที่พร้อมรับการเปลี่ยนแปลง',
        feasibilityScore: 0.6,
        innovationScore: 0.9,
        complianceScore: 0.7,
        overallScore: 0.73,
      },
    ];
  }
}
