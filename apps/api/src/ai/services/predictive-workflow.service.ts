import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';
import { SystemPromptsService } from '../../system-prompts/system-prompts.service';

export interface PredictionResult {
  type: string;   // deadline, risk, next_step, assignee, routing
  value: Record<string, any>;
  confidence: number;
}

@Injectable()
export class PredictiveWorkflowService {
  private readonly logger = new Logger(PredictiveWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiApiService,
    private readonly prompts: SystemPromptsService,
    private readonly config: ConfigService,
  ) {}

  async generatePredictions(caseId: bigint): Promise<void> {
    if (this.config.get('ENABLE_PREDICTIVE_WORKFLOW') !== 'true') return;

    const inboundCase = await this.prisma.inboundCase.findUnique({
      where: { id: caseId },
      include: {
        sourceDocument: true,
        topics: true,
        organization: true,
      },
    });
    if (!inboundCase) return;

    // Get AI result for extracted text context
    const intake = await this.prisma.documentIntake.findFirst({
      where: { id: inboundCase.sourceDocumentId ? undefined : undefined },
      include: { aiResult: true },
    });

    // Also fetch intake by document relation
    const intakeByDoc = inboundCase.sourceDocumentId
      ? await this.prisma.documentIntake.findFirst({
          where: {},
          include: { aiResult: true },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    const aiResult = intakeByDoc?.aiResult;
    const extractedText = aiResult?.extractedText || '';
    const subject = inboundCase.title || '';
    const summary = inboundCase.description || '';

    let predictions: PredictionResult[];

    if (this.gemini.getApiKey()) {
      predictions = await this.generateWithLLM(subject, summary, extractedText, inboundCase);
    } else {
      predictions = this.generateFallback(inboundCase);
    }

    // Save predictions to database
    for (const pred of predictions) {
      await this.prisma.casePrediction.create({
        data: {
          inboundCaseId: caseId,
          predictionType: pred.type,
          predictionValue: JSON.stringify(pred.value),
          confidence: pred.confidence,
        },
      });
    }

    this.logger.log(`Generated ${predictions.length} predictions for case #${caseId}`);
  }

  private async generateWithLLM(
    subject: string,
    summary: string,
    extractedText: string,
    inboundCase: any,
  ): Promise<PredictionResult[]> {
    const prompt = `คุณเป็นผู้เชี่ยวชาญด้านงานสารบรรณราชการไทย
วิเคราะห์หนังสือราชการต่อไปนี้ แล้วทำนายสิ่งที่จะต้องดำเนินการ

เรื่อง: ${subject}
สรุป: ${summary}
ระดับความเร่งด่วน: ${inboundCase.urgencyLevel}
กำหนดส่ง: ${inboundCase.dueDate || 'ไม่ระบุ'}

เนื้อหาหนังสือ (ย่อ):
${extractedText.substring(0, 2000)}

ตอบเป็น JSON array โดยแต่ละรายการมีรูปแบบ:
[
  {
    "type": "next_step",
    "value": {
      "steps": ["ขั้นตอน 1", "ขั้นตอน 2", "ขั้นตอน 3"],
      "estimatedDays": 7,
      "description": "คำอธิบายสั้น"
    },
    "confidence": 0.85
  },
  {
    "type": "risk",
    "value": {
      "level": "medium",
      "factors": ["ปัจจัยเสี่ยง 1"],
      "mitigation": "แนวทางลดความเสี่ยง"
    },
    "confidence": 0.7
  },
  {
    "type": "deadline",
    "value": {
      "suggestedDeadline": "2026-04-20",
      "reason": "เหตุผลที่แนะนำกำหนดส่ง",
      "daysFromNow": 14
    },
    "confidence": 0.8
  },
  {
    "type": "routing",
    "value": {
      "suggestedDepartment": "ฝ่ายวิชาการ",
      "reason": "เหตุผลที่แนะนำฝ่ายนี้"
    },
    "confidence": 0.75
  }
]

ตอบเฉพาะ JSON array เท่านั้น ไม่ต้องมีข้อความอื่น`;

    try {
      const rawText = await this.gemini.generateText({
        user: prompt,
        maxOutputTokens: 1024,
        temperature: 0.3,
      });
      const jsonMatch = (rawText || '[]').match(/\[[\s\S]*\]/);
      const parsed = JSON.parse(jsonMatch?.[0] || '[]');
      return parsed.map((p: any) => ({
        type: p.type || 'next_step',
        value: p.value || {},
        confidence: Math.min(1, Math.max(0, p.confidence || 0.5)),
      }));
    } catch (err) {
      this.logger.error(`LLM prediction failed: ${err.message}`);
      return this.generateFallback(inboundCase);
    }
  }

  private generateFallback(inboundCase: any): PredictionResult[] {
    const predictions: PredictionResult[] = [];

    // Next step prediction
    predictions.push({
      type: 'next_step',
      value: {
        steps: ['ลงรับหนังสือ', 'พิจารณาเนื้อหา', 'มอบหมายผู้รับผิดชอบ'],
        estimatedDays: 7,
        description: 'ขั้นตอนมาตรฐานสำหรับหนังสือราชการ',
      },
      confidence: 0.6,
    });

    // Risk prediction based on urgency
    const urgency = inboundCase.urgencyLevel || 'normal';
    const riskLevel = urgency === 'most_urgent' ? 'high'
      : urgency === 'very_urgent' ? 'high'
      : urgency === 'urgent' ? 'medium'
      : 'low';

    predictions.push({
      type: 'risk',
      value: {
        level: riskLevel,
        factors: urgency !== 'normal'
          ? ['หนังสือมีความเร่งด่วน อาจมีกำหนดส่งที่จำกัด']
          : ['ความเสี่ยงต่ำ เป็นหนังสือทั่วไป'],
        mitigation: 'ควรดำเนินการตามลำดับความสำคัญ',
      },
      confidence: 0.5,
    });

    // Deadline prediction
    if (inboundCase.dueDate) {
      const dueDate = new Date(inboundCase.dueDate);
      const now = new Date();
      const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      predictions.push({
        type: 'deadline',
        value: {
          suggestedDeadline: dueDate.toISOString().split('T')[0],
          reason: 'ตามกำหนดส่งที่ระบุในหนังสือ',
          daysFromNow: diffDays,
        },
        confidence: 0.9,
      });
    }

    return predictions;
  }

  async getPredictions(caseId: bigint) {
    const predictions = await this.prisma.casePrediction.findMany({
      where: { inboundCaseId: caseId },
      orderBy: { createdAt: 'desc' },
    });
    return predictions.map((p) => ({
      id: Number(p.id),
      caseId: Number(p.inboundCaseId),
      type: p.predictionType,
      value: JSON.parse(p.predictionValue),
      confidence: Number(p.confidence),
      isAccepted: p.isAccepted,
      createdAt: p.createdAt,
    }));
  }

  async submitFeedback(predictionId: bigint, accepted: boolean) {
    return this.prisma.casePrediction.update({
      where: { id: predictionId },
      data: { isAccepted: accepted },
    });
  }
}
