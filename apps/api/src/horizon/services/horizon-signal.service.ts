import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class HorizonSignalService {
  private readonly logger = new Logger(HorizonSignalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: this.configService.get('CLAUDE_MODEL', 'claude-sonnet-4-6'),
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'x-api-key': this.configService.get('ANTHROPIC_API_KEY'),
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        },
      );

      const rawContent = response.data.content?.[0]?.text || '[]';
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
