import { Injectable, Logger } from '@nestjs/common';
import { GeminiApiService } from '../../gemini/gemini-api.service';

export type ResponseType =
  | 'reply_required'
  | 'action_required'
  | 'report_required'
  | 'informational'
  | 'unknown';

export interface ResponseClassificationResult {
  responseType: ResponseType;
  confidence: number;
  reason: string;
}

const VALID_TYPES: ResponseType[] = [
  'reply_required',
  'action_required',
  'report_required',
  'informational',
  'unknown',
];

@Injectable()
export class ResponseRequirementClassifierService {
  private readonly logger = new Logger(ResponseRequirementClassifierService.name);

  constructor(private readonly gemini: GeminiApiService) {}

  /**
   * Classify what kind of response a Thai government letter requires.
   * Best-effort: returns 'unknown' on any failure rather than throwing.
   */
  async classify(input: {
    subjectText?: string | null;
    summaryText?: string | null;
    extractedText?: string | null;
    nextActionJson?: string | null;
  }): Promise<ResponseClassificationResult> {
    const subject = (input.subjectText ?? '').trim();
    const summary = (input.summaryText ?? '').trim();
    const text = (input.extractedText ?? '').trim().substring(0, 2000);
    const actions = (input.nextActionJson ?? '').trim();

    if (!subject && !summary && !text) {
      return { responseType: 'unknown', confidence: 0, reason: 'ไม่มีเนื้อหาให้จำแนก' };
    }

    const prompt = `จำแนกว่าหนังสือราชการนี้ต้องการการตอบสนองแบบใด เลือก 1 ค่าจาก:

- reply_required: ต้องส่งหนังสือตอบกลับเป็นลายลักษณ์อักษร (เช่น ขอความอนุเคราะห์ ขอความร่วมมือ สอบถาม เชิญเข้าร่วม ขอข้อมูล)
- action_required: ต้องดำเนินการตามที่สั่ง โดยไม่จำเป็นต้องตอบเป็นหนังสือ (เช่น คำสั่งให้ปฏิบัติ แต่งตั้ง มอบหมาย ประกาศบังคับใช้)
- report_required: ต้องดำเนินการแล้วรายงานผลกลับเป็นหนังสือ (เช่น ให้สำรวจแล้วรายงาน ให้ดำเนินโครงการแล้วรายงานผล)
- informational: แจ้งเพื่อทราบเท่านั้น ไม่ต้องตอบกลับและไม่ต้องดำเนินการ (เช่น ประชาสัมพันธ์ แจ้งข่าว เวียนทราบ ส่งสำเนา)

หลักการตัดสินใจ:
1. ถ้ามีคำว่า "ขอความอนุเคราะห์/ขอความร่วมมือ/โปรดแจ้ง/ขอเชิญ/ขอทราบ" → reply_required
2. ถ้ามีคำว่า "ให้รายงาน/พร้อมรายงานผล/ส่งผลการดำเนินงาน" → report_required
3. ถ้ามีคำว่า "ให้ดำเนินการ/สั่งให้/แต่งตั้ง" โดยไม่ขอผลตอบกลับ → action_required
4. ถ้ามีคำว่า "เพื่อทราบ/เพื่อโปรดทราบ/แจ้งให้ทราบ/ประชาสัมพันธ์" และไม่มีการขอตอบ → informational
5. ถ้าไม่ชัด ใช้ informational แต่ confidence ต่ำ

═══ ข้อมูลหนังสือ ═══
เรื่อง: ${subject || '—'}
สรุป: ${summary || '—'}
${actions ? `Action ที่ระบุ: ${actions.substring(0, 500)}` : ''}
${text ? `เนื้อหา (excerpt): ${text}` : ''}

ตอบเป็น JSON เท่านั้น ไม่มี markdown:
{ "responseType": "<หนึ่งใน 4 ค่าด้านบน>", "confidence": <0.0-1.0>, "reason": "<เหตุผลสั้นๆ ภาษาไทย ไม่เกิน 100 ตัวอักษร>" }`;

    try {
      const raw = await this.gemini.generateText({
        user: prompt,
        maxOutputTokens: 256,
        temperature: 0.2,
      });

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        this.logger.warn(`Classifier returned non-JSON: ${raw.substring(0, 200)}`);
        return { responseType: 'unknown', confidence: 0, reason: 'ตอบไม่เป็น JSON' };
      }

      const parsed = JSON.parse(match[0]);
      const responseType: ResponseType = VALID_TYPES.includes(parsed.responseType)
        ? parsed.responseType
        : 'unknown';
      const confidence = typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;
      const reason = typeof parsed.reason === 'string'
        ? parsed.reason.substring(0, 500)
        : '';

      return { responseType, confidence, reason };
    } catch (err: any) {
      this.logger.warn(`Classify failed: ${err?.message}`);
      this.gemini.logAxiosError('responseRequirementClassifier', err);
      return { responseType: 'unknown', confidence: 0, reason: `error: ${err?.message ?? 'unknown'}` };
    }
  }
}
