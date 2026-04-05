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

  /**
   * สำหรับงานที่ประมวลผลแบบ async (คิว Bull) — replyToken มักหมดอายุก่อน job รันเสร็จ
   * ลอง reply ก่อน ถ้าไม่สำเร็จจะส่ง push ไปที่ lineUserId แทน
   */
  async replyOrPush(
    replyToken: string | null | undefined,
    lineUserId: string,
    messages: any[],
  ): Promise<void> {
    if (replyToken) {
      try {
        await axios.post(
          `${LINE_API}/message/reply`,
          { replyToken, messages },
          { headers: this.headers },
        );
        return;
      } catch (err: any) {
        const detail = err?.response?.data?.message || err?.message || 'unknown';
        this.logger.warn(`LINE reply failed (${detail}), falling back to push`);
      }
    }
    if (!lineUserId || lineUserId === 'unknown') {
      this.logger.error('LINE replyOrPush: no valid lineUserId for push fallback');
      return;
    }
    await this.push(lineUserId, messages);
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
    caseId?: number;
  }) {
    const caseId = data.caseId;
    return [
      {
        type: 'flex',
        altText: `หนังสือราชการ: ${data.subject || 'ไม่ทราบเรื่อง'}`,
        contents: {
          type: 'bubble',
          size: 'giga',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#1B5E20',
            paddingAll: '16px',
            contents: [
              { type: 'text', text: 'หนังสือราชการ', color: '#FFFFFF', size: 'xs', weight: 'bold' },
              { type: 'text', text: data.subject || 'ไม่ทราบเรื่อง', color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true, maxLines: 3 },
            ],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            paddingAll: '16px',
            contents: [
              this.flexRow('หน่วยงาน', data.issuingAuthority || '-'),
              this.flexRow('เลขที่', data.documentNo || '-'),
              this.flexRow('วันที่', data.documentDate || '-'),
              this.flexRow('กำหนดส่ง', data.deadlineDate || '-'),
              { type: 'separator', margin: 'md' },
              { type: 'text', text: 'สรุป', size: 'xs', color: '#888888', margin: 'md' },
              { type: 'text', text: (data.summary || '-').substring(0, 500), size: 'sm', wrap: true, maxLines: 8 },
            ],
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            paddingAll: '16px',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#1B5E20',
                action: { type: 'message', label: 'ลงรับหนังสือ', text: caseId ? `ลงรับ #${caseId}` : 'ลงรับหนังสือ' },
              },
              {
                type: 'button',
                style: 'primary',
                color: '#1565C0',
                action: { type: 'message', label: 'มอบหมายงาน', text: caseId ? `มอบหมาย #${caseId}` : 'มอบหมายงาน' },
              },
              {
                type: 'box',
                layout: 'horizontal',
                spacing: 'sm',
                contents: [
                  {
                    type: 'button',
                    style: 'secondary',
                    action: { type: 'message', label: 'สรุปเอกสาร', text: 'สรุปเอกสาร' },
                    flex: 1,
                  },
                  {
                    type: 'button',
                    style: 'secondary',
                    action: { type: 'message', label: 'ร่างตอบ', text: 'ร่างตอบ' },
                    flex: 1,
                  },
                ],
              },
            ],
          },
        },
      },
    ];
  }

  buildAssignmentNotification(data: {
    caseTitle: string;
    registrationNo: string;
    directorNote: string;
    dueDate: string;
    assignedByName: string;
    assignmentId: number;
  }) {
    return [
      {
        type: 'flex',
        altText: `งานใหม่: ${data.caseTitle}`,
        contents: {
          type: 'bubble',
          size: 'giga',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#1565C0',
            paddingAll: '16px',
            contents: [
              { type: 'text', text: 'งานที่ได้รับมอบหมาย', color: '#FFFFFF', size: 'xs', weight: 'bold' },
              { type: 'text', text: data.caseTitle || '-', color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true, maxLines: 3 },
            ],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            paddingAll: '16px',
            contents: [
              this.flexRow('เลขรับ', data.registrationNo || '-'),
              this.flexRow('สั่งการโดย', data.assignedByName || '-'),
              this.flexRow('กำหนดเสร็จ', data.dueDate || '-'),
              ...(data.directorNote ? [
                { type: 'separator', margin: 'md' } as any,
                { type: 'text', text: 'คำสั่ง', size: 'xs', color: '#888888', margin: 'md' } as any,
                { type: 'text', text: data.directorNote.substring(0, 500), size: 'sm', wrap: true } as any,
              ] : []),
            ],
          },
          footer: {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            paddingAll: '16px',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#1B5E20',
                action: { type: 'message', label: 'รับทราบ', text: `รับทราบ #${data.assignmentId}` },
                flex: 1,
              },
              {
                type: 'button',
                style: 'primary',
                color: '#E65100',
                action: { type: 'message', label: 'เสร็จแล้ว', text: `เสร็จแล้ว #${data.assignmentId}` },
                flex: 1,
              },
            ],
          },
        },
      },
    ];
  }

  buildCompletionNotification(data: {
    caseTitle: string;
    completedByName: string;
    assignmentId: number;
  }) {
    return [
      this.buildTextMessage(
        `✅ งานเสร็จสิ้น\n\n` +
        `📋 ${data.caseTitle}\n` +
        `👤 ดำเนินการโดย: ${data.completedByName}\n\n` +
        `งาน #${data.assignmentId} ถูกปิดเรียบร้อยแล้ว`,
      ),
    ];
  }

  buildMyTasksList(tasks: {
    assignmentId: number;
    caseTitle: string;
    registrationNo: string;
    dueDate: string;
    status: string;
  }[]) {
    if (tasks.length === 0) {
      return [this.buildTextMessage('ไม่มีงานที่ค้างอยู่ในขณะนี้')];
    }

    const bubbles = tasks.slice(0, 10).map((t) => {
      const statusColor = t.status === 'completed' ? '#4CAF50'
        : t.status === 'in_progress' ? '#FF9800'
        : '#2196F3';
      const statusLabel = t.status === 'completed' ? 'เสร็จแล้ว'
        : t.status === 'in_progress' ? 'กำลังดำเนินการ'
        : t.status === 'accepted' ? 'รับทราบแล้ว'
        : 'รอดำเนินการ';

      return {
        type: 'bubble',
        size: 'kilo',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingAll: '14px',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: t.registrationNo || '-', size: 'xs', color: '#888888', flex: 0 },
                { type: 'text', text: statusLabel, size: 'xs', color: statusColor, align: 'end', weight: 'bold' },
              ],
            },
            { type: 'text', text: t.caseTitle, size: 'sm', weight: 'bold', wrap: true, maxLines: 2, margin: 'sm' },
            { type: 'text', text: `กำหนด: ${t.dueDate || '-'}`, size: 'xs', color: '#888888', margin: 'sm' },
          ],
          action: { type: 'message', label: 'ดูงาน', text: `เสร็จแล้ว #${t.assignmentId}` },
        },
      };
    });

    return [
      {
        type: 'flex',
        altText: `งานของคุณ (${tasks.length} รายการ)`,
        contents: { type: 'carousel', contents: bubbles },
      },
    ];
  }

  buildStaffListForAssign(caseId: number, staffList: { userId: number; fullName: string; positionTitle: string; department: string }[]) {
    if (staffList.length === 0) {
      return [this.buildTextMessage('ไม่พบบุคลากรในระบบ กรุณาเพิ่มผู้ใช้ก่อน')];
    }

    const items = staffList.slice(0, 13).map((s) => ({
      type: 'action' as const,
      action: {
        type: 'message' as const,
        label: s.fullName.substring(0, 20),
        text: `มอบหมายให้ #${caseId} @${s.userId}`,
      },
    }));

    return [
      this.buildQuickReply(
        'เลือกผู้รับมอบหมาย:',
        staffList.slice(0, 13).map((s) => ({
          label: s.fullName.substring(0, 20),
          text: `มอบหมายให้ #${caseId} @${s.userId}`,
        })),
      ),
    ];
  }

  private flexRow(label: string, value: string): any {
    return {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: label, size: 'xs', color: '#888888', flex: 3 },
        { type: 'text', text: value, size: 'sm', flex: 5, wrap: true },
      ],
    };
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
