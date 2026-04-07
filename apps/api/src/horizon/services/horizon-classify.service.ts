import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';

@Injectable()
export class HorizonClassifyService {
  private readonly logger = new Logger(HorizonClassifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiApiService,
  ) {}

  async classify(documentId: number) {
    const doc = await this.prisma.horizonSourceDocument.findUnique({
      where: { id: BigInt(documentId) },
      include: { source: true },
    });
    if (!doc) throw new NotFoundException(`HorizonSourceDocument #${documentId} not found`);

    const textToClassify = doc.normalizedText || doc.rawText;
    const truncated = textToClassify.substring(0, 8000);

    const prompt = `คุณเป็น AI สำหรับวิเคราะห์เอกสารราชการไทยด้านการศึกษา
วิเคราะห์เนื้อหาต่อไปนี้และตอบในรูปแบบ JSON เท่านั้น:

เนื้อหา:
"""
${truncated}
"""

ตอบเป็น JSON ดังนี้:
{
  "contentType": "news|policy_news|event|announcement|speech|report",
  "summary": "สรุปเนื้อหาไม่เกิน 3 ประโยค",
  "topics": ["topic_code_1", "topic_code_2"],
  "agendas": [
    {
      "agendaCode": "รหัสวาระ เช่น OBEC-2025-QUALITY",
      "agendaTitle": "ชื่อวาระ",
      "agendaType": "policy_push|campaign|event_series|reform_signal|operational_focus",
      "agendaScope": "national|regional|district",
      "relationType": "primary|secondary|mention",
      "confidence": 0.85
    }
  ],
  "qualityScore": 0.75
}`;

    try {
      const rawContent = await this.gemini.generateText({ user: prompt, maxOutputTokens: 2048 }) || '{}';
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] || '{}');

      // Update document with classification results
      await this.prisma.horizonSourceDocument.update({
        where: { id: BigInt(documentId) },
        data: {
          contentType: parsed.contentType || doc.contentType,
          summaryText: parsed.summary || null,
          qualityScore: parsed.qualityScore ?? null,
          status: 'classified',
        },
      });

      // Link to agendas
      if (parsed.agendas?.length) {
        for (const agendaData of parsed.agendas) {
          const agenda = await this.findOrCreateAgenda(agendaData);
          await this.prisma.horizonDocumentAgenda.create({
            data: {
              horizonDocumentId: BigInt(documentId),
              horizonAgendaId: agenda.id,
              relationType: agendaData.relationType || 'mention',
              confidenceScore: agendaData.confidence ?? 0.5,
            },
          });
        }
      }

      this.logger.log(`Classified document #${documentId} as ${parsed.contentType}`);
      return {
        documentId,
        status: 'classified',
        contentType: parsed.contentType,
        topicCount: parsed.topics?.length || 0,
        agendaCount: parsed.agendas?.length || 0,
      };
    } catch (error) {
      this.logger.error(`Classification failed for document #${documentId}: ${error.message}`);
      throw error;
    }
  }

  extractTopics(text: string): string[] {
    const topicPatterns = [
      { pattern: /คุณภาพการศึกษา|quality/i, code: 'QUALITY' },
      { pattern: /หลักสูตร|curriculum/i, code: 'CURRICULUM' },
      { pattern: /งบประมาณ|budget|เงิน/i, code: 'BUDGET' },
      { pattern: /บุคลากร|personnel|ครู|teacher/i, code: 'PERSONNEL' },
      { pattern: /เทคโนโลยี|technology|ดิจิทัล|digital/i, code: 'TECHNOLOGY' },
      { pattern: /ความปลอดภัย|safety|security/i, code: 'SAFETY' },
      { pattern: /ประเมิน|evaluation|assess/i, code: 'EVALUATION' },
      { pattern: /นักเรียน|student|ผู้เรียน/i, code: 'STUDENT' },
      { pattern: /อาหาร|food|โภชนาการ|nutrition/i, code: 'NUTRITION' },
      { pattern: /กีฬา|sport|physical/i, code: 'SPORTS' },
    ];

    const topics: string[] = [];
    for (const { pattern, code } of topicPatterns) {
      if (pattern.test(text)) topics.push(code);
    }
    return topics;
  }

  async findOrCreateAgenda(agendaData: {
    agendaCode: string;
    agendaTitle: string;
    agendaType: string;
    agendaScope?: string;
  }) {
    let agenda = await this.prisma.horizonAgenda.findUnique({
      where: { agendaCode: agendaData.agendaCode },
    });

    if (!agenda) {
      agenda = await this.prisma.horizonAgenda.create({
        data: {
          agendaCode: agendaData.agendaCode,
          agendaTitle: agendaData.agendaTitle,
          agendaType: agendaData.agendaType,
          agendaScope: agendaData.agendaScope || 'national',
          currentStatus: 'emerging',
        },
      });
      this.logger.log(`Created new agenda: ${agendaData.agendaCode}`);
    }

    return agenda;
  }
}
