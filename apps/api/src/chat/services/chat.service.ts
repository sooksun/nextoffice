import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PolicyRagService } from '../../rag/services/policy-rag.service';
import { HorizonRagService } from '../../rag/services/horizon-rag.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';
import { PageContextService, PageContext } from './page-context.service';

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
  pageContext?: { pageName: string };
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly gemini: GeminiApiService,
    private readonly policyRag: PolicyRagService,
    private readonly horizonRag: HorizonRagService,
    private readonly pageCtxService: PageContextService,
  ) {}

  async chat(query: string, pageContext?: PageContext, userId?: number): Promise<ChatResponse> {
    const queryId = `chat-${Date.now()}`;

    // Resolve page context in parallel with RAG searches
    const [policyResults, horizonResults, resolvedCtx] = await Promise.all([
      this.policyRag.search(query, 4),
      this.horizonRag.search(query, 3),
      pageContext ? this.pageCtxService.resolve(pageContext, userId) : Promise.resolve(null),
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

    const answer = await this.callGemini(query, ragContext, resolvedCtx);

    return {
      answer,
      sources,
      queryId,
      ...(resolvedCtx ? { pageContext: { pageName: resolvedCtx.pageName } } : {}),
    };
  }

  private async callGemini(
    query: string,
    ragContext: string,
    pageCtx?: { pageName: string; summary: string; details: string } | null,
  ): Promise<string> {
    if (!this.gemini.getApiKey()) {
      return 'ขออภัย ระบบ AI ยังไม่ได้รับการกำหนดค่า GEMINI_API_KEY';
    }

    // Build page-aware system prompt
    let pageSection = '';
    if (pageCtx) {
      pageSection =
        `\n\n== บริบทหน้าปัจจุบัน ==\n` +
        `ผู้ใช้กำลังอยู่ที่หน้า: ${pageCtx.pageName}\n` +
        `${pageCtx.summary}\n` +
        (pageCtx.details ? `\nข้อมูลในหน้า:\n${pageCtx.details}\n` : '');
    }

    const systemPrompt =
      `คุณเป็นผู้ช่วย AI ประจำระบบ NextOffice (ระบบงานสารบรรณอิเล็กทรอนิกส์) สำหรับสถาบันการศึกษา ` +
      `คุณมีความเชี่ยวชาญทั้งด้านระเบียบงานสารบรรณไทยและการใช้งานระบบ NextOffice ` +
      `ตอบคำถามด้วยภาษาไทยที่ชัดเจน ถูกต้อง และเป็นประโยชน์\n\n` +
      `ความสามารถของคุณ:\n` +
      `1. ตอบคำถามเกี่ยวกับระเบียบงานสารบรรณ พ.ศ. 2526 และที่แก้ไขเพิ่มเติม\n` +
      `2. อธิบายหนังสือราชการ 6 ประเภท, การรับ-ส่ง-เก็บรักษาหนังสือ\n` +
      `3. ช่วยเหลือเรื่องข้อมูลในหน้าปัจจุบันที่ผู้ใช้กำลังดูอยู่ — ตอบคำถามเกี่ยวกับเอกสาร เคส หรือข้อมูลที่แสดงบนหน้าจอ\n` +
      `4. แนะนำขั้นตอนการทำงานในระบบ NextOffice\n\n` +
      `หลักการตอบ:\n` +
      `- ถ้าผู้ใช้ถามเกี่ยวกับข้อมูลในหน้าปัจจุบัน ให้อ้างอิงจากบริบทหน้าเว็บที่ให้มา\n` +
      `- ถ้าถามเรื่องระเบียบหรือแนวปฏิบัติ ให้อ้างอิงจากฐานข้อมูล RAG\n` +
      `- ถ้าเกี่ยวข้องทั้งสองอย่าง ให้ผสมผสานข้อมูลจากทั้งสองแหล่ง\n` +
      `- ตอบกระชับ ตรงประเด็น ใช้ภาษาราชการอย่างเหมาะสม` +
      pageSection +
      (ragContext ? `\n\n== ข้อมูลอ้างอิงจากฐานความรู้ RAG ==\n${ragContext}` : '');

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
