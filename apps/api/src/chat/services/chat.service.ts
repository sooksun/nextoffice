import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PolicyRagService } from '../../rag/services/policy-rag.service';
import { HorizonRagService } from '../../rag/services/horizon-rag.service';

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
    private readonly config: ConfigService,
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

    const answer = await this.callClaude(query, ragContext);
    return { answer, sources, queryId };
  }

  private async callClaude(query: string, ragContext: string): Promise<string> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return 'ขออภัย ระบบ AI ยังไม่ได้รับการกำหนดค่า ANTHROPIC_API_KEY';
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
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: this.config.get('CLAUDE_MODEL', 'claude-sonnet-4-6'),
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: query }],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          timeout: 30000,
          proxy: this.config.get('HTTPS_PROXY')
            ? undefined
            : false,
        },
      );
      return res.data?.content?.[0]?.text || 'ขออภัย ไม่สามารถประมวลผลคำตอบได้';
    } catch (err) {
      this.logger.error(`Claude call failed: ${err.message}`);
      return 'ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อ AI กรุณาลองใหม่อีกครั้ง';
    }
  }
}
