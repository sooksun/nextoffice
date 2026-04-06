import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiApiService } from '../../gemini/gemini-api.service';

export interface IntentResult {
  intent: string;       // forward, assign, ask_ai, create_memo, register, acknowledge, complete, summarize, unknown
  entities: {
    targetDepartment?: string;
    targetPerson?: string;
    caseReference?: number;
    urgency?: string;
    documentReference?: string;
  };
  confidence: number;
  originalText: string;
}

// Heuristic patterns for quick matching without LLM
const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: string; entityExtractor?: (m: RegExpMatchArray) => Record<string, any> }> = [
  {
    pattern: /^ส่ง(?:เรื่องนี้)?(?:ให้|ไป(?:ที่)?)\s*(.+)/,
    intent: 'forward',
    entityExtractor: (m) => ({ targetDepartment: m[1].trim() }),
  },
  {
    pattern: /^มอบหมาย(?:ให้|งาน(?:ให้)?)\s*(.+)/,
    intent: 'assign',
    entityExtractor: (m) => ({ targetPerson: m[1].trim() }),
  },
  {
    pattern: /^(?:ถาม|สอบถาม)\s*(?:AI|เอไอ|ระบบ)?\s*(.*)/,
    intent: 'ask_ai',
  },
  {
    pattern: /^(?:สร้าง|ร่าง)(?:บันทึก(?:เสนอ)?|หนังสือ(?:ตอบ)?|เรื่อง)/,
    intent: 'create_memo',
  },
  {
    pattern: /^(?:ลงรับ|รับเข้า)(?:\s*(?:หนังสือ|เรื่อง))?/,
    intent: 'register',
  },
  {
    pattern: /^(?:รับทราบ|ทราบแล้ว|ok|โอเค)/i,
    intent: 'acknowledge',
  },
  {
    pattern: /^(?:เสร็จแล้ว|ดำเนินการแล้ว|เรียบร้อย)/,
    intent: 'complete',
  },
  {
    pattern: /^(?:สรุป|ช่วยสรุป)(?:\s*(?:เอกสาร|หนังสือ|เรื่อง))?/,
    intent: 'summarize',
  },
  {
    pattern: /^(?:แปล|ช่วยแปล)/,
    intent: 'translate',
  },
  {
    pattern: /^(?:เรื่องด่วน|ด่วน(?:มาก)?|urgent)/i,
    intent: 'mark_urgent',
  },
  {
    pattern: /^(?:รายงาน|สถานะ|ภาพรวม)(?:\s*(?:วันนี้|ประจำวัน))?/,
    intent: 'daily_summary',
  },
];

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);

  constructor(
    private readonly gemini: GeminiApiService,
    private readonly config: ConfigService,
  ) {}

  async classify(text: string): Promise<IntentResult> {
    if (this.config.get('ENABLE_NLU_COMMANDS') !== 'true') {
      return { intent: 'unknown', entities: {}, confidence: 0, originalText: text };
    }

    // Try heuristic patterns first (fast, no API call)
    const heuristicResult = this.classifyHeuristic(text);
    if (heuristicResult && heuristicResult.confidence >= 0.8) {
      return heuristicResult;
    }

    // Fallback to LLM for ambiguous text
    if (this.gemini.getApiKey()) {
      return this.classifyWithLLM(text);
    }

    return heuristicResult || { intent: 'unknown', entities: {}, confidence: 0, originalText: text };
  }

  private classifyHeuristic(text: string): IntentResult | null {
    const trimmed = text.trim();
    for (const { pattern, intent, entityExtractor } of INTENT_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        const entities = entityExtractor ? entityExtractor(match) : {};
        return {
          intent,
          entities,
          confidence: 0.85,
          originalText: text,
        };
      }
    }
    return null;
  }

  private async classifyWithLLM(text: string): Promise<IntentResult> {
    const prompt = `จงวิเคราะห์ข้อความต่อไปนี้ที่ผู้ใช้พิมพ์ในระบบสารบรรณราชการผ่าน LINE
แล้วระบุ intent และ entities

ข้อความ: "${text}"

Intent ที่เป็นไปได้:
- forward: ส่งเรื่องไปยังฝ่าย/หน่วยงาน
- assign: มอบหมายงานให้บุคคล
- ask_ai: ถามคำถามเกี่ยวกับเอกสาร
- create_memo: สร้าง/ร่างบันทึกหรือหนังสือ
- register: ลงรับหนังสือ
- acknowledge: รับทราบ
- complete: แจ้งว่าดำเนินการเสร็จ
- summarize: ขอสรุปเอกสาร
- translate: แปลเอกสาร
- mark_urgent: ทำเครื่องหมายด่วน
- daily_summary: ขอรายงานประจำวัน
- unknown: ไม่ชัดเจน

ตอบเป็น JSON:
{
  "intent": "...",
  "entities": {
    "targetDepartment": "ชื่อฝ่าย (ถ้ามี)",
    "targetPerson": "ชื่อบุคคล (ถ้ามี)",
    "urgency": "ระดับความเร่งด่วน (ถ้ามี)"
  },
  "confidence": 0.0-1.0
}

ตอบเฉพาะ JSON เท่านั้น`;

    try {
      const rawText = await this.gemini.generateText({
        user: prompt,
        maxOutputTokens: 256,
        temperature: 0.1,
      });
      const jsonMatch = (rawText || '{}').match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] || '{}');
      return {
        intent: parsed.intent || 'unknown',
        entities: parsed.entities || {},
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        originalText: text,
      };
    } catch (err) {
      this.logger.error(`LLM intent classification failed: ${err.message}`);
      return { intent: 'unknown', entities: {}, confidence: 0, originalText: text };
    }
  }
}
