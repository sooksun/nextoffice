import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const LINE_API = 'https://api.line.me/v2/bot';

@Injectable()
export class LineMessagingService {
  private readonly logger = new Logger(LineMessagingService.name);

  constructor(private readonly config: ConfigService) {}

  private get headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.get('LINE_CHANNEL_ACCESS_TOKEN')}`,
    };
  }

  async reply(replyToken: string, messages: any[]): Promise<void> {
    try {
      await axios.post(
        `${LINE_API}/message/reply`,
        { replyToken, messages },
        { headers: this.headers },
      );
    } catch (err) {
      this.logger.error(`LINE reply failed: ${err?.response?.data?.message || err.message}`);
    }
  }

  async push(to: string, messages: any[]): Promise<void> {
    try {
      await axios.post(
        `${LINE_API}/message/push`,
        { to, messages },
        { headers: this.headers },
      );
    } catch (err) {
      this.logger.error(`LINE push failed: ${err?.response?.data?.message || err.message}`);
    }
  }

  async getMessageContent(messageId: string): Promise<Buffer> {
    const res = await axios.get(
      `${LINE_API}/message/${messageId}/content`,
      { headers: this.headers, responseType: 'arraybuffer' },
    );
    return Buffer.from(res.data);
  }

  buildTextMessage(text: string) {
    return { type: 'text', text };
  }

  buildQuickReply(text: string, items: { label: string; text: string }[]) {
    return {
      type: 'text',
      text,
      quickReply: {
        items: items.map((item) => ({
          type: 'action',
          action: { type: 'message', label: item.label, text: item.text },
        })),
      },
    };
  }

  buildOfficialDocumentReply(data: {
    subject: string;
    issuingAuthority: string;
    documentNo: string;
    documentDate: string;
    deadlineDate: string;
    summary: string;
  }) {
    const text =
      `✅ ระบบวิเคราะห์ว่าเอกสารนี้เป็นหนังสือราชการ\n\n` +
      `📋 เรื่อง: ${data.subject || '-'}\n` +
      `🏛 หน่วยงาน: ${data.issuingAuthority || '-'}\n` +
      `📝 เลขที่: ${data.documentNo || '-'}\n` +
      `📅 วันที่: ${data.documentDate || '-'}\n` +
      `⏰ กำหนดส่ง: ${data.deadlineDate || '-'}\n\n` +
      `📌 สรุป: ${data.summary || '-'}`;

    return [
      this.buildTextMessage(text),
      this.buildQuickReply('ต้องการดำเนินการอะไรต่อ?', [
        { label: '📄 สร้างบันทึกเสนอ', text: 'สร้างบันทึกเสนอ' },
        { label: '✏️ ร่างตอบ', text: 'ร่างตอบ' },
        { label: '📋 มอบหมายงาน', text: 'มอบหมายงาน' },
      ]),
    ];
  }

  buildNonOfficialDocumentReply() {
    return [
      this.buildQuickReply(
        'ระบบประเมินว่าเอกสารนี้ไม่ใช่หนังสือราชการ\nต้องการให้ช่วยอะไรต่อ?',
        [
          { label: '📝 สรุปเอกสาร', text: 'สรุปเอกสาร' },
          { label: '🌐 แปลเอกสาร', text: 'แปลเอกสาร' },
          { label: '🔑 ดึงสาระสำคัญ', text: 'ดึงสาระสำคัญ' },
          { label: '✉️ ร่างข้อความตอบ', text: 'ร่างข้อความตอบ' },
          { label: '📁 เก็บเป็นเอกสารอ้างอิง', text: 'เก็บเป็นเอกสารอ้างอิง' },
        ],
      ),
    ];
  }

  buildRagActionReply(actionCode: string, aiText: string, ragHits: number) {
    const actionLabels: Record<string, string> = {
      summarize: '📋 สรุปเอกสาร',
      translate: '🌐 แปลเอกสาร',
      extract_key: '🔑 สาระสำคัญ',
      draft_reply: '✉️ ร่างตอบ',
      create_memo: '📄 บันทึกเสนอ',
      assign_task: '📋 มอบหมายงาน',
      freeform: '💬 ผลลัพธ์',
    };
    const label = actionLabels[actionCode] ?? '💬 ผลลัพธ์';
    const ragNote = ragHits > 0 ? `\n\n📚 อ้างอิงจาก ${ragHits} แหล่งข้อมูล (RAG)` : '';
    const fullText = `${label}\n\n${aiText}${ragNote}`;

    return [
      // LINE text message limit is 5000 chars
      this.buildTextMessage(fullText.substring(0, 5000)),
      this.buildQuickReply('ต้องการดำเนินการอะไรต่อ?', [
        { label: '🔑 ดึงสาระสำคัญ', text: 'ดึงสาระสำคัญ' },
        { label: '✉️ ร่างตอบ', text: 'ร่างตอบ' },
        { label: '📋 มอบหมายงาน', text: 'มอบหมายงาน' },
      ]),
    ];
  }
}
