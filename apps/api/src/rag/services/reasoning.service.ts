import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RetrievalService } from './retrieval.service';
import axios from 'axios';

@Injectable()
export class ReasoningService {
  private readonly logger = new Logger(ReasoningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly retrieval: RetrievalService,
  ) {}

  async generateCaseOptions(caseId: bigint, orgId: bigint, query: string): Promise<void> {
    const results = await this.retrieval.retrieve(caseId, query, orgId);

    const horizonItems = results.filter((r) => r.sourceType === 'horizon').slice(0, 3);
    const policyItems = results.filter((r) => r.sourceType === 'policy').slice(0, 3);

    const apiKey = this.config.get('ANTHROPIC_API_KEY');
    let options: any[];

    if (apiKey) {
      options = await this.generateOptionsWithLLM(query, horizonItems, policyItems);
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
  ): Promise<any[]> {
    const horizonContext = horizonItems
      .map((h) => `- ${h.data?.title || h.rationale}`)
      .join('\n');
    const policyContext = policyItems
      .map((p) => `- ${p.data?.title || p.rationale}`)
      .join('\n');

    const prompt = `คุณเป็นที่ปรึกษาด้านนโยบายการศึกษาระดับผู้เชี่ยวชาญ
เรื่อง: ${query}

ข้อมูล Horizon RAG (แนวโน้มโลก):
${horizonContext || 'ไม่มีข้อมูล'}

ข้อมูล Policy RAG (กฎระเบียบที่เกี่ยวข้อง):
${policyContext || 'ไม่มีข้อมูล'}

สร้างข้อเสนอ 3 ทางเลือก (A=ปลอดภัย, B=สมดุล, C=นวัตกรรม) ตอบเป็น JSON array:
[
  {
    "code": "A",
    "title": "ชื่อทางเลือก",
    "description": "รายละเอียด",
    "implementationSteps": "ขั้นตอนการดำเนินงาน",
    "expectedBenefits": "ประโยชน์ที่คาดหวัง",
    "risks": "ความเสี่ยง",
    "policyComplianceNote": "มุมกติกา",
    "contextFitNote": "มุมบริบท",
    "feasibilityScore": 0.0-1.0,
    "innovationScore": 0.0-1.0,
    "complianceScore": 0.0-1.0,
    "overallScore": 0.0-1.0
  }
]`;

    try {
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: this.config.get('CLAUDE_MODEL', 'claude-sonnet-4-6'),
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'x-api-key': this.config.get('ANTHROPIC_API_KEY'),
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        },
      );

      const rawText = res.data?.content?.[0]?.text || '[]';
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      return JSON.parse(jsonMatch?.[0] || '[]');
    } catch (err) {
      this.logger.error(`LLM option generation failed: ${err.message}`);
      return this.generateFallbackOptions(query);
    }
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
