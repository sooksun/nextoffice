import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';
import { SystemPromptsService } from '../../system-prompts/system-prompts.service';

export interface DraftResult {
  draftType: string;  // memo, reply_letter, report, assignment_order
  title: string;
  content: string;
  metadata: Record<string, any>;
}

@Injectable()
export class DraftGeneratorService {
  private readonly logger = new Logger(DraftGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiApiService,
    private readonly prompts: SystemPromptsService,
  ) {}

  async generateDraft(
    caseId: bigint,
    draftType: string,
    additionalContext?: string,
  ): Promise<DraftResult> {
    const inboundCase = await this.prisma.inboundCase.findUnique({
      where: { id: caseId },
      include: {
        sourceDocument: true,
        organization: true,
        options: { take: 3, orderBy: { overallScore: 'desc' } },
      },
    });
    if (!inboundCase) throw new Error(`Case ${caseId} not found`);

    // Get AI result for context
    const latestIntake = await this.prisma.documentIntake.findFirst({
      where: {},
      include: { aiResult: true },
      orderBy: { createdAt: 'desc' },
    });

    const aiResult = latestIntake?.aiResult;
    const extractedText = aiResult?.extractedText?.substring(0, 2000) || '';
    const summary = inboundCase.description || '';
    const subject = inboundCase.title || '';
    const orgName = inboundCase.organization?.name || 'หน่วยงาน';

    const optionsContext = inboundCase.options
      .map((o) => `${o.optionCode}: ${o.title} — ${o.description}`)
      .join('\n');

    if (!this.gemini.getApiKey()) {
      return this.generateFallbackDraft(draftType, subject, summary, orgName);
    }

    const prompt = this.buildDraftPrompt(draftType, {
      subject,
      summary,
      extractedText,
      orgName,
      optionsContext,
      additionalContext: additionalContext || '',
      dueDate: inboundCase.dueDate?.toISOString().split('T')[0] || '',
    });

    try {
      const rawText = await this.gemini.generateText({
        user: prompt,
        maxOutputTokens: 2048,
        temperature: 0.4,
      });

      const jsonMatch = (rawText || '{}').match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] || '{}');

      return {
        draftType,
        title: parsed.title || `ร่าง${this.getDraftTypeName(draftType)} — ${subject}`,
        content: parsed.content || rawText || '',
        metadata: {
          caseId: Number(caseId),
          generatedAt: new Date().toISOString(),
          ...parsed.metadata,
        },
      };
    } catch (err) {
      this.logger.error(`Draft generation failed: ${err.message}`);
      return this.generateFallbackDraft(draftType, subject, summary, orgName);
    }
  }

  private buildDraftPrompt(
    draftType: string,
    ctx: Record<string, string>,
  ): string {
    const typeInstructions: Record<string, string> = {
      memo: `สร้างร่างบันทึกเสนอ (บันทึกข้อความ) ตามรูปแบบราชการไทย
โดยมีส่วนหัว (บันทึกข้อความ/ส่วนราชการ/ที่/วันที่/เรื่อง) และเนื้อหา`,
      reply_letter: `สร้างร่างหนังสือตอบกลับ ตามรูปแบบหนังสือราชการ
มีส่วนหัว ที่ วันที่ เรื่อง เรียน และเนื้อหา`,
      report: `สร้างร่างรายงานผลการดำเนินงาน
มีบทนำ วัตถุประสงค์ ผลการดำเนินงาน ปัญหาอุปสรรค ข้อเสนอแนะ`,
      assignment_order: `สร้างร่างคำสั่งมอบหมายงาน
มีชื่อคำสั่ง เหตุผล รายการที่มอบหมาย ผู้รับผิดชอบ กำหนดเวลา`,
    };

    return `คุณเป็นผู้เชี่ยวชาญด้านการร่างเอกสารราชการไทย

${typeInstructions[draftType] || typeInstructions.memo}

ข้อมูลประกอบ:
เรื่อง: ${ctx.subject}
สรุป: ${ctx.summary}
หน่วยงาน: ${ctx.orgName}
กำหนดส่ง: ${ctx.dueDate || 'ไม่ระบุ'}
${ctx.optionsContext ? `ทางเลือกที่ AI แนะนำ:\n${ctx.optionsContext}` : ''}
${ctx.additionalContext ? `บริบทเพิ่มเติม: ${ctx.additionalContext}` : ''}

เนื้อหาหนังสือต้นฉบับ (ย่อ):
${ctx.extractedText}

ตอบเป็น JSON:
{
  "title": "ชื่อเรื่องของร่าง",
  "content": "เนื้อหาร่างเต็ม (ใช้ \\n สำหรับขึ้นบรรทัดใหม่)",
  "metadata": {
    "documentType": "${draftType}",
    "suggestedRecipient": "ผู้รับ (ถ้ามี)"
  }
}

ตอบเฉพาะ JSON เท่านั้น`;
  }

  private getDraftTypeName(type: string): string {
    const names: Record<string, string> = {
      memo: 'บันทึกเสนอ',
      reply_letter: 'หนังสือตอบ',
      report: 'รายงานผล',
      assignment_order: 'คำสั่งมอบหมาย',
    };
    return names[type] || 'เอกสาร';
  }

  private generateFallbackDraft(
    draftType: string,
    subject: string,
    summary: string,
    orgName: string,
  ): DraftResult {
    const typeName = this.getDraftTypeName(draftType);
    return {
      draftType,
      title: `ร่าง${typeName} — ${subject}`,
      content: `บันทึกข้อความ\nส่วนราชการ: ${orgName}\nเรื่อง: ${subject}\n\nเรียน ผู้อำนวยการ\n\nตามที่ได้รับหนังสือ เรื่อง ${subject}\n${summary}\n\nจึงเรียนมาเพื่อโปรดพิจารณา\n\nขอแสดงความนับถือ`,
      metadata: {
        draftType,
        generatedAt: new Date().toISOString(),
        note: 'ร่างอัตโนมัติ (ไม่ได้ใช้ AI) — กรุณาตรวจสอบและแก้ไขก่อนใช้งาน',
      },
    };
  }
}
