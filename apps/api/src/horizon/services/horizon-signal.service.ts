import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';

@Injectable()
export class HorizonSignalService {
  private readonly logger = new Logger(HorizonSignalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiApiService,
  ) {}

  async extractSignals(documentId: number) {
    const doc = await this.prisma.horizonSourceDocument.findUnique({
      where: { id: BigInt(documentId) },
    });
    if (!doc) throw new NotFoundException(`HorizonSourceDocument #${documentId} not found`);

    const text = doc.normalizedText || doc.rawText;
    const truncated = text.substring(0, 8000);

    const prompt = `คุณเป็น AI วิเคราะห์สัญญาณ (signals) จากเอกสารราชการไทยด้านการศึกษา
สกัดสัญญาณที่สำคัญสำหรับโรงเรียนจากเนื้อหาต่อไปนี้:

เนื้อหา:
"""
${truncated}
"""

ตอบเป็น JSON array:
[
  {
    "signalType": "policy_signal|event_signal|urgency_signal|funding_signal|implementation_signal",
    "signalTitle": "ชื่อสัญญาณ (ไม่เกิน 100 ตัวอักษร)",
    "signalText": "รายละเอียดสัญญาณ",
    "actionabilityLevel": "low|medium|high",
    "targetEntities": "หน่วยงานเป้าหมาย เช่น โรงเรียนทุกสังกัด",
    "effectiveDate": "YYYY-MM-DD หรือ null",
    "expiresAt": "YYYY-MM-DD หรือ null"
  }
]

ถ้าไม่มีสัญญาณ ให้ตอบ []`;

    try {
      const rawContent = await this.gemini.generateText({ user: prompt, maxOutputTokens: 2048 }) || '[]';
      const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
      const signals = JSON.parse(jsonMatch?.[0] || '[]');

      const created = [];
      for (const sig of signals) {
        const record = await this.prisma.horizonSignal.create({
          data: {
            horizonDocumentId: BigInt(documentId),
            signalType: sig.signalType || 'policy_signal',
            signalTitle: (sig.signalTitle || '').substring(0, 255),
            signalText: sig.signalText || '',
            actionabilityLevel: sig.actionabilityLevel || 'medium',
            targetEntities: sig.targetEntities || null,
            effectiveDate: sig.effectiveDate ? new Date(sig.effectiveDate) : null,
            expiresAt: sig.expiresAt ? new Date(sig.expiresAt) : null,
          },
        });
        created.push(Number(record.id));
      }

      this.logger.log(`Extracted ${created.length} signals from document #${documentId}`);
      return { documentId, signalCount: created.length, signalIds: created };
    } catch (error) {
      this.logger.error(`Signal extraction failed for document #${documentId}: ${error.message}`);
      throw error;
    }
  }
}
