import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PolicyRagService } from '../../rag/services/policy-rag.service';
import { HorizonRagService } from '../../rag/services/horizon-rag.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';

export interface ChatSource {
  type: 'policy' | 'horizon';
  title: string;
  summary: string;
  score: number;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  queryId: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly gemini: GeminiApiService,
    private readonly policyRag: PolicyRagService,
    private readonly horizonRag: HorizonRagService,
  ) {}

  async chat(query: string): Promise<ChatResponse> {
    const queryId = `chat-${Date.now()}`;

    const [policyResults, horizonResults] = await Promise.all([
      this.policyRag.search(query, 4),
      this.horizonRag.search(query, 3),
    ]);

    const sources: ChatSource[] = [
      ...policyResults.map((p) => ({
        type: 'policy' as const,
        title: p.title || 'ระเบียบ',
        summary: p.summary || '',
        score: p.semanticScore ?? 0,
      })),
      ...horizonResults.map((h) => ({
        type: 'horizon' as const,
        title: h.title || 'แนวโน้ม',
        summary: h.summary || '',
        score: h.semanticScore ?? 0,
      })),
    ].filter((s) => s.score > 0.05);

    const ragContext = [
      ...policyResults.map((p) => `[ระเบียบ/นโยบาย] ${p.title}:\n${p.summary || ''}`),
      ...horizonResults.map((h) => `[แนวโน้ม/แนวปฏิบัติ] ${h.title}:\n${h.summary || ''}`),
    ]
      .filter(Boolean)
      .join('\n\n');

    const answer = await this.callGemini(query, ragContext);
    return { answer, sources, queryId };
  }

  private async callGemini(query: string, ragContext: string): Promise<string> {
    if (!this.gemini.getApiKey()) {
      return 'ขออภัย ระบบ AI ยังไม่ได้รับการกำหนดค่า GEMINI_API_KEY';
    }

    const systemPrompt =
      `คุณเป็นผู้เชี่ยวชาญด้านระเบียบงานสารบรรณไทยและการจัดการเอกสารราชการสำหรับสถาบันการศึกษา ` +
      `ตอบคำถามด้วยภาษาไทยที่ชัดเจน ถูกต้องตามระเบียบ และเป็นประโยชน์ ` +
      `ครอบคลุมเรื่อง: ระเบียบงานสารบรรณ พ.ศ. 2526 และที่แก้ไขเพิ่มเติม, หนังสือราชการ 6 ประเภท, ` +
      `การรับ-ส่ง-เก็บรักษาหนังสือ, การร่างและจัดทำหนังสือราชการ, ตราชื่อส่วนราชการ, ` +
      `ทะเบียนหนังสือ, และขั้นตอนการปฏิบัติงานสารบรรณ ` +
      `หากมีข้อมูลอ้างอิงจากฐานข้อมูล RAG ให้นำมาใช้ประกอบการตอบ` +
      (ragContext ? `\n\nข้อมูลอ้างอิงจากฐานข้อมูล:\n${ragContext}` : '');

    try {
      const text = await this.gemini.generateText({
        system: systemPrompt,
        user: query,
        maxOutputTokens: 1500,
        temperature: 0.4,
      });
      return text || 'ขออภัย ไม่สามารถประมวลผลคำตอบได้';
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const body = err.response?.data as { error?: { message?: string; status?: string } } | undefined;
        const apiMsg = body?.error?.message ?? '';
        this.gemini.logAxiosError('Gemini (chat)', err);
        if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(apiMsg)) {
          return 'ขออภัย GEMINI_API_KEY ไม่ถูกต้อง กรุณาตรวจสอบใน apps/api/.env';
        }
        if (status === 403 || /PERMISSION_DENIED/i.test(apiMsg)) {
          return 'ขออภัย บัญชี Google AI ปฏิเสธการเรียกใช้ กรุณาตรวจสอบสิทธิ์ API ใน Google AI Studio';
        }
        if (status === 429 || /RESOURCE_EXHAUSTED|quota|Quota exceeded/i.test(apiMsg)) {
          return 'ขออภัย เกินโควต้า Gemini API กรุณารอแล้วลองใหม่หรือตรวจสอบแพ็กเกจใน Google AI Studio';
        }
        if (status === 400 && /model|not found|is not found/i.test(apiMsg)) {
          return 'ขออภัย ชื่อโมเดลไม่ถูกต้อง กรุณาตรวจสอบ GEMINI_MODEL ใน apps/api/.env';
        }
        if (!err.response && (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED')) {
          return 'ขออภัย เครือข่ายไม่สามารถเชื่อมต่อ Google Generative Language API ได้';
        }
      } else if (err instanceof Error) {
        this.logger.error(`Gemini call failed: ${err.message}`);
      } else {
        this.logger.error('Gemini call failed: unknown error');
      }
      return 'ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อ AI กรุณาลองใหม่อีกครั้ง';
    }
  }
}
