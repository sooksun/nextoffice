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
                action: { type: 'message', label: 'เสนอ ผอ.', text: caseId ? `มอบหมาย #${caseId}` : 'มอบหมาย' },
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
              {
                type: 'box',
                layout: 'horizontal',
                spacing: 'sm',
                contents: [
                  {
                    type: 'button',
                    style: 'secondary',
                    color: '#757575',
                    action: { type: 'message', label: 'รอพิจารณา', text: caseId ? `รอพิจารณา #${caseId}` : 'รอพิจารณา' },
                    flex: 1,
                  },
                  {
                    type: 'button',
                    style: 'secondary',
                    color: '#0288D1',
                    action: { type: 'message', label: 'สร้างเรื่อง', text: 'สร้างเรื่อง' },
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

  buildStaffListForAssign(
    caseId: number,
    staffList: { userId: number; fullName: string; positionTitle: string; department: string }[],
    headerNote?: string,
  ) {
    if (staffList.length === 0) {
      return [this.buildTextMessage('ไม่พบบุคลากรในระบบ กรุณาเพิ่มผู้ใช้ก่อน')];
    }

    const prompt = `เลือกผู้รับมอบหมาย:${headerNote || ''}`;

    return [
      this.buildQuickReply(
        prompt,
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
      assign_task: '📋 เสนอ ผอ.',
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
        { label: '📋 เสนอ ผอ.', text: 'มอบหมาย' },
      ]),
    ];
  }

  // ─── V2: Saraban Inbound Carousel ───────────────────

  buildSarabanInboundCarousel(
    cases: any[],
    total: number,
    filter?: string,
  ): any[] {
    const filterLabel = filter === 'urgent' ? ' (ด่วน)'
      : filter === 'pending' ? ' (รอดำเนินการ)'
      : filter === 'today' ? ' (วันนี้)'
      : '';

    if (cases.length === 0) {
      return [
        this.buildQuickReply(`ไม่พบรายการในทะเบียนรับ${filterLabel}`, [
          { label: '📋 ทะเบียนรับทั้งหมด', text: 'ทะเบียนรับ' },
          { label: '📊 ภาพรวม', text: 'ภาพรวม' },
        ]),
      ];
    }

    const bubbles = cases.slice(0, 10).map((c) => {
      const urgencyColor = c.urgencyLevel === 'most_urgent' ? '#D32F2F'
        : c.urgencyLevel === 'very_urgent' ? '#E64A19'
        : c.urgencyLevel === 'urgent' ? '#F9A825'
        : '#43A047';
      const urgencyLabel = c.urgencyLevel === 'most_urgent' ? 'ด่วนที่สุด'
        : c.urgencyLevel === 'very_urgent' ? 'ด่วนที่สุด'
        : c.urgencyLevel === 'urgent' ? 'ด่วน'
        : 'ปกติ';
      const statusLabel = this.statusToThai(c.status);
      const caseId = Number(c.id);

      return {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box',
          layout: 'horizontal',
          backgroundColor: urgencyColor,
          paddingAll: '10px',
          contents: [
            { type: 'text', text: c.registrationNo || `#${caseId}`, color: '#FFFFFF', size: 'xs', weight: 'bold', flex: 0 },
            { type: 'text', text: urgencyLabel, color: '#FFFFFF', size: 'xxs', align: 'end' },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingAll: '12px',
          contents: [
            { type: 'text', text: c.title, size: 'sm', weight: 'bold', wrap: true, maxLines: 2 },
            { type: 'text', text: `ผู้ส่ง: ${c.sourceDocument?.issuingAuthority || '-'}`, size: 'xs', color: '#888888', wrap: true, maxLines: 1 },
            { type: 'text', text: `สถานะ: ${statusLabel}`, size: 'xs', color: '#888888' },
            ...(c.assignedTo ? [{ type: 'text', text: `ผู้รับผิดชอบ: ${c.assignedTo.fullName}`, size: 'xs', color: '#888888' } as any] : []),
          ],
        },
        footer: {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          paddingAll: '10px',
          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              color: '#1565C0',
              action: { type: 'message', label: 'ดูรายละเอียด', text: `ดูเรื่อง #${caseId}` },
              flex: 1,
            },
            {
              type: 'button',
              style: 'secondary',
              height: 'sm',
              action: { type: 'message', label: 'ลงรับ', text: `ลงรับ #${caseId}` },
              flex: 1,
            },
          ],
        },
      };
    });

    return [
      {
        type: 'flex',
        altText: `ทะเบียนรับ${filterLabel} (${total} รายการ)`,
        contents: { type: 'carousel', contents: bubbles },
      },
      this.buildQuickReply(`ทะเบียนรับ${filterLabel}: ${total} รายการ`, [
        { label: '🔴 เฉพาะด่วน', text: 'ทะเบียนรับด่วน' },
        { label: '⏳ รอดำเนินการ', text: 'ทะเบียนรับรอดำเนินการ' },
        { label: '📅 วันนี้', text: 'ทะเบียนรับวันนี้' },
        { label: '📊 ภาพรวม', text: 'ภาพรวม' },
      ]),
    ];
  }

  // ─── V2: Saraban Outbound Carousel ─────────────────

  buildSarabanOutboundCarousel(docs: any[], total: number): any[] {
    if (docs.length === 0) {
      return [this.buildTextMessage('ยังไม่มีหนังสือส่งออกในระบบ')];
    }

    const bubbles = docs.slice(0, 10).map((d) => {
      const statusColor = d.status === 'sent' ? '#43A047'
        : d.status === 'approved' ? '#1565C0'
        : d.status === 'pending_approval' ? '#F9A825'
        : '#757575';
      const statusLabel = d.status === 'sent' ? 'ส่งแล้ว'
        : d.status === 'approved' ? 'อนุมัติแล้ว'
        : d.status === 'pending_approval' ? 'รออนุมัติ'
        : d.status === 'draft' ? 'ร่าง'
        : d.status;

      return {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box',
          layout: 'horizontal',
          backgroundColor: statusColor,
          paddingAll: '10px',
          contents: [
            { type: 'text', text: d.documentNo || `#${Number(d.id)}`, color: '#FFFFFF', size: 'xs', weight: 'bold', flex: 0 },
            { type: 'text', text: statusLabel, color: '#FFFFFF', size: 'xxs', align: 'end' },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingAll: '12px',
          contents: [
            { type: 'text', text: d.subject || '-', size: 'sm', weight: 'bold', wrap: true, maxLines: 2 },
            { type: 'text', text: `ถึง: ${d.recipientOrg || '-'}`, size: 'xs', color: '#888888', wrap: true, maxLines: 1 },
            { type: 'text', text: `วันที่: ${d.createdAt ? new Date(d.createdAt).toLocaleDateString('th-TH') : '-'}`, size: 'xs', color: '#888888' },
          ],
        },
      };
    });

    return [
      {
        type: 'flex',
        altText: `ทะเบียนส่ง (${total} รายการ)`,
        contents: { type: 'carousel', contents: bubbles },
      },
      this.buildQuickReply(`ทะเบียนส่ง: ${total} รายการ`, [
        { label: '📋 ทะเบียนรับ', text: 'ทะเบียนรับ' },
        { label: '📊 ภาพรวม', text: 'ภาพรวม' },
      ]),
    ];
  }

  // ─── V2: Case Detail Flex ──────────────────────────

  buildCaseDetailFlex(c: any): any[] {
    const caseId = Number(c.id);
    const urgencyLabel = c.urgencyLevel === 'most_urgent' ? 'ด่วนที่สุด'
      : c.urgencyLevel === 'very_urgent' ? 'ด่วนที่สุด'
      : c.urgencyLevel === 'urgent' ? 'ด่วน'
      : 'ปกติ';
    const urgencyColor = c.urgencyLevel === 'most_urgent' ? '#D32F2F'
      : c.urgencyLevel === 'very_urgent' ? '#E64A19'
      : c.urgencyLevel === 'urgent' ? '#F9A825'
      : '#1B5E20';

    const assignees = (c.assignments || [])
      .map((a) => `${a.assignedTo?.fullName || '?'} (${this.assignmentStatusThai(a.status)})`)
      .join('\n');

    const activities = (c.activities || [])
      .slice(0, 3)
      .map((a) => `• ${this.activityToThai(a.action)}${a.user ? ` - ${a.user.fullName}` : ''}`)
      .join('\n');

    const bodyContents: any[] = [
      this.flexRow('เลขรับ', c.registrationNo || 'ยังไม่ลงรับ'),
      this.flexRow('สถานะ', this.statusToThai(c.status)),
      this.flexRow('ความเร่งด่วน', urgencyLabel),
      this.flexRow('หน่วยงาน', c.organization?.name || '-'),
      this.flexRow('ผู้ส่ง', c.sourceDocument?.issuingAuthority || '-'),
      this.flexRow('เลขที่หนังสือ', c.sourceDocument?.documentCode || '-'),
      this.flexRow('วันที่รับ', c.receivedAt ? new Date(c.receivedAt).toLocaleDateString('th-TH') : '-'),
      this.flexRow('กำหนดเสร็จ', c.dueDate ? new Date(c.dueDate).toLocaleDateString('th-TH') : '-'),
    ];

    if (c.assignedTo) {
      bodyContents.push(this.flexRow('ผู้รับผิดชอบ', c.assignedTo.fullName));
    }
    if (c.directorNote) {
      bodyContents.push(
        { type: 'separator', margin: 'md' },
        { type: 'text', text: 'คำสั่งผู้บริหาร', size: 'xs', color: '#888888', margin: 'md' },
        { type: 'text', text: c.directorNote.substring(0, 300), size: 'sm', wrap: true, color: '#1565C0' },
      );
    }
    if (assignees) {
      bodyContents.push(
        { type: 'separator', margin: 'md' },
        { type: 'text', text: 'ผู้ได้รับมอบหมาย', size: 'xs', color: '#888888', margin: 'md' },
        { type: 'text', text: assignees, size: 'xs', wrap: true },
      );
    }
    if (activities) {
      bodyContents.push(
        { type: 'separator', margin: 'md' },
        { type: 'text', text: 'กิจกรรมล่าสุด', size: 'xs', color: '#888888', margin: 'md' },
        { type: 'text', text: activities, size: 'xs', wrap: true, color: '#666666' },
      );
    }

    return [
      {
        type: 'flex',
        altText: `เรื่อง #${caseId}: ${c.title}`,
        contents: {
          type: 'bubble',
          size: 'giga',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: urgencyColor,
            paddingAll: '16px',
            contents: [
              { type: 'text', text: `เรื่อง #${caseId}`, color: '#FFFFFF', size: 'xs', weight: 'bold' },
              { type: 'text', text: c.title || '-', color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true, maxLines: 3 },
            ],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            paddingAll: '16px',
            contents: bodyContents,
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            paddingAll: '16px',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                spacing: 'sm',
                contents: [
                  {
                    type: 'button',
                    style: 'primary',
                    height: 'sm',
                    color: '#1B5E20',
                    action: { type: 'message', label: 'ลงรับ', text: `ลงรับ #${caseId}` },
                    flex: 1,
                  },
                  {
                    type: 'button',
                    style: 'primary',
                    height: 'sm',
                    color: '#1565C0',
                    action: { type: 'message', label: 'เสนอ ผอ.', text: `มอบหมาย #${caseId}` },
                    flex: 1,
                  },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                spacing: 'sm',
                contents: [
                  {
                    type: 'button',
                    style: 'secondary',
                    height: 'sm',
                    action: { type: 'message', label: 'สรุป', text: 'สรุปเอกสาร' },
                    flex: 1,
                  },
                  {
                    type: 'button',
                    style: 'secondary',
                    height: 'sm',
                    action: { type: 'message', label: 'ร่างตอบ', text: 'ร่างตอบ' },
                    flex: 1,
                  },
                  {
                    type: 'button',
                    style: 'secondary',
                    height: 'sm',
                    action: { type: 'message', label: 'รอพิจารณา', text: `รอพิจารณา #${caseId}` },
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

  // ─── V2: Dashboard Flex ────────────────────────────

  buildDashboardFlex(data: {
    userName: string;
    orgName: string;
    totalCases: number;
    todayInbound: number;
    urgentCount: number;
    pendingCount: number;
    overdueCount: number;
    myTaskCount: number;
    recentCases: { id: number; title: string; urgency: string; status: string }[];
  }): any[] {
    const urgentIcon = data.urgentCount > 0 ? '🔴' : '🟢';
    const overdueIcon = data.overdueCount > 0 ? '⚠️' : '✅';

    const recentLines = data.recentCases
      .slice(0, 5)
      .map((c) => {
        const icon = c.urgency !== 'normal' ? '🔴' : '📄';
        return `${icon} ${c.title.substring(0, 35)}`;
      })
      .join('\n');

    const summaryText = [
      `📊 ภาพรวม NextOffice`,
      `👤 ${data.userName} | ${data.orgName}`,
      ``,
      `📥 เอกสารเข้าวันนี้: ${data.todayInbound} ฉบับ`,
      `📂 เคสทั้งหมด: ${data.totalCases} เรื่อง`,
      `${urgentIcon} เรื่องด่วน: ${data.urgentCount} เรื่อง`,
      `⏳ รอดำเนินการ: ${data.pendingCount} เรื่อง`,
      `${overdueIcon} เกินกำหนด: ${data.overdueCount} เรื่อง`,
      `📋 งานของฉัน: ${data.myTaskCount} รายการ`,
      ``,
      `📋 เรื่องล่าสุด:`,
      recentLines || '(ไม่มี)',
    ].join('\n');

    return [
      this.buildTextMessage(summaryText.substring(0, 5000)),
      this.buildQuickReply('เลือกดูข้อมูลเพิ่มเติม:', [
        { label: '📋 ทะเบียนรับ', text: 'ทะเบียนรับ' },
        { label: '📤 ทะเบียนส่ง', text: 'ทะเบียนส่ง' },
        { label: '🔴 เรื่องด่วน', text: 'ทะเบียนรับด่วน' },
        { label: '⏰ งานเกินกำหนด', text: 'งานเกินกำหนด' },
        { label: '📋 งานของฉัน', text: 'งานของฉัน' },
        { label: '🔍 ค้นหาเรื่อง', text: 'ค้นหา ' },
      ]),
    ];
  }

  // ─── V2: Search Results Carousel ───────────────────

  buildSearchResultsCarousel(cases: any[], keyword: string): any[] {
    const bubbles = cases.slice(0, 10).map((c) => {
      const caseId = Number(c.id);
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
                { type: 'text', text: c.registrationNo || `#${caseId}`, size: 'xs', color: '#888888', flex: 0 },
                { type: 'text', text: this.statusToThai(c.status), size: 'xs', color: '#1565C0', align: 'end', weight: 'bold' },
              ],
            },
            { type: 'text', text: c.title, size: 'sm', weight: 'bold', wrap: true, maxLines: 2, margin: 'sm' },
            { type: 'text', text: `ผู้ส่ง: ${c.sourceDocument?.issuingAuthority || '-'}`, size: 'xs', color: '#888888', margin: 'sm' },
          ],
          action: { type: 'message', label: 'ดูเรื่อง', text: `ดูเรื่อง #${caseId}` },
        },
      };
    });

    return [
      {
        type: 'flex',
        altText: `ผลการค้นหา "${keyword}" (${cases.length} รายการ)`,
        contents: { type: 'carousel', contents: bubbles },
      },
    ];
  }

  // ─── V2: Overdue Carousel ──────────────────────────

  buildOverdueCarousel(cases: any[]): any[] {
    const bubbles = cases.slice(0, 10).map((c) => {
      const caseId = Number(c.id);
      const overdueDays = c.dueDate
        ? Math.ceil((Date.now() - new Date(c.dueDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box',
          layout: 'horizontal',
          backgroundColor: '#D32F2F',
          paddingAll: '10px',
          contents: [
            { type: 'text', text: c.registrationNo || `#${caseId}`, color: '#FFFFFF', size: 'xs', weight: 'bold', flex: 0 },
            { type: 'text', text: `เกิน ${overdueDays} วัน`, color: '#FFFFFF', size: 'xxs', align: 'end' },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingAll: '12px',
          contents: [
            { type: 'text', text: c.title, size: 'sm', weight: 'bold', wrap: true, maxLines: 2 },
            { type: 'text', text: `ผู้รับผิดชอบ: ${c.assignedTo?.fullName || 'ยังไม่มอบหมาย'}`, size: 'xs', color: '#888888' },
            { type: 'text', text: `กำหนด: ${c.dueDate ? new Date(c.dueDate).toLocaleDateString('th-TH') : '-'}`, size: 'xs', color: '#D32F2F' },
          ],
        },
        footer: {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          paddingAll: '10px',
          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              color: '#1565C0',
              action: { type: 'message', label: 'ดูรายละเอียด', text: `ดูเรื่อง #${caseId}` },
              flex: 1,
            },
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              color: '#1B5E20',
              action: { type: 'message', label: 'เสนอ ผอ.', text: `มอบหมาย #${caseId}` },
              flex: 1,
            },
          ],
        },
      };
    });

    return [
      {
        type: 'flex',
        altText: `งานเกินกำหนด (${cases.length} เรื่อง)`,
        contents: { type: 'carousel', contents: bubbles },
      },
      this.buildQuickReply(`⚠️ งานเกินกำหนด ${cases.length} เรื่อง`, [
        { label: '📋 ทะเบียนรับ', text: 'ทะเบียนรับ' },
        { label: '📊 ภาพรวม', text: 'ภาพรวม' },
        { label: '📋 งานของฉัน', text: 'งานของฉัน' },
      ]),
    ];
  }

  // ─── V2: Main Menu ─────────────────────────────────

  buildMainMenu(): any[] {
    return [
      {
        type: 'flex',
        altText: 'เมนูหลัก NextOffice',
        contents: {
          type: 'bubble',
          size: 'giga',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#1B5E20',
            paddingAll: '16px',
            contents: [
              { type: 'text', text: 'NextOffice', color: '#FFFFFF', size: 'lg', weight: 'bold' },
              { type: 'text', text: 'ระบบงานสารบรรณอิเล็กทรอนิกส์', color: '#C8E6C9', size: 'xs' },
            ],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            paddingAll: '16px',
            contents: [
              { type: 'text', text: '📊 ภาพรวมและรายงาน', size: 'xs', color: '#888888', weight: 'bold' },
              this.menuButton('📊 ภาพรวมวันนี้', 'ภาพรวม'),
              this.menuButton('📋 งานของฉัน', 'งานของฉัน'),
              this.menuButton('⏰ งานเกินกำหนด', 'งานเกินกำหนด'),
              { type: 'separator', margin: 'md' },
              { type: 'text', text: '📥 ทะเบียนเอกสาร', size: 'xs', color: '#888888', weight: 'bold', margin: 'md' },
              this.menuButton('📥 ทะเบียนรับ', 'ทะเบียนรับ'),
              this.menuButton('📤 ทะเบียนส่ง', 'ทะเบียนส่ง'),
              this.menuButton('🔴 เรื่องด่วน', 'ทะเบียนรับด่วน'),
              this.menuButton('📅 เอกสารวันนี้', 'ทะเบียนรับวันนี้'),
              { type: 'separator', margin: 'md' },
              { type: 'separator', margin: 'md' },
              { type: 'text', text: '🕐 ลงเวลา / Leave', size: 'xs', color: '#888888', weight: 'bold', margin: 'md' },
              this.menuButton('🕐 ลงเวลา', 'ลงเวลา'),
              this.menuButton('📊 สถานะลงเวลา', 'สถานะลงเวลา'),
              this.menuButton('📝 ขอลา', 'ขอลา'),
              this.menuButton('🚗 ไปราชการ', 'ขอไปราชการ'),
              this.menuButton('📋 สถานะการลา', 'สถานะการลา'),
              { type: 'separator', margin: 'md' },
              { type: 'text', text: '🔍 เครื่องมือ', size: 'xs', color: '#888888', weight: 'bold', margin: 'md' },
              this.menuButton('🔍 ค้นหาเรื่อง', 'ค้นหา '),
              this.menuButton('💬 ถาม AI สารบรรณ', 'วิธีการรับหนังสือราชการ?'),
            ],
          },
        },
      },
    ];
  }

  private menuButton(label: string, text: string): any {
    return {
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: { type: 'message', label: label.substring(0, 20), text },
      margin: 'sm',
    };
  }

  private statusToThai(status: string): string {
    const map: Record<string, string> = {
      new: 'ใหม่', analyzing: 'วิเคราะห์', proposed: 'เสนอ AI',
      registered: 'ลงรับแล้ว', assigned: 'มอบหมายแล้ว',
      in_progress: 'กำลังดำเนินการ', completed: 'เสร็จสิ้น', archived: 'เก็บถาวร',
    };
    return map[status] || status;
  }

  private assignmentStatusThai(status: string): string {
    const map: Record<string, string> = {
      pending: 'รอรับทราบ', accepted: 'รับทราบแล้ว',
      in_progress: 'กำลังดำเนินการ', completed: 'เสร็จสิ้น',
    };
    return map[status] || status;
  }

  private activityToThai(action: string): string {
    const map: Record<string, string> = {
      register: 'ลงรับหนังสือ', assign: 'มอบหมายงาน',
      comment: 'แสดงความเห็น', update_status: 'เปลี่ยนสถานะ',
      select_option: 'เลือกแนวทาง', complete: 'เสร็จสิ้น',
      close: 'ปิดเรื่อง', auto_complete: 'เสร็จอัตโนมัติ',
    };
    return map[action] || action;
  }

  // ─── V2: Executive Snapshot ───────────────────────

  buildExecutiveSnapshotFlex(data: {
    date: string;
    totalInbound: number;
    urgentCount: number;
    pendingCount: number;
    overdueCount: number;
    recentItems: Array<{ title: string; urgency: string; status: string }>;
  }): any[] {
    const urgencyIcon = data.urgentCount > 0 ? '🔴' : '🟢';
    const overdueIcon = data.overdueCount > 0 ? '⚠️' : '✅';

    const recentLines = data.recentItems
      .slice(0, 5)
      .map((item) => {
        const icon = item.urgency !== 'normal' ? '🔴' : '📄';
        return `${icon} ${item.title.substring(0, 40)}`;
      })
      .join('\n');

    const summaryText = [
      `📊 สรุปประจำวัน ${data.date}`,
      '',
      `📥 หนังสือเข้าวันนี้: ${data.totalInbound} ฉบับ`,
      `${urgencyIcon} ด่วน: ${data.urgentCount} เรื่อง`,
      `⏳ รอดำเนินการ: ${data.pendingCount} เรื่อง`,
      `${overdueIcon} เกินกำหนด: ${data.overdueCount} เรื่อง`,
      '',
      '📋 เรื่องล่าสุด:',
      recentLines || '(ไม่มี)',
    ].join('\n');

    return [
      this.buildTextMessage(summaryText.substring(0, 5000)),
      this.buildQuickReply('ต้องการดูอะไรเพิ่มเติม?', [
        { label: '📥 ดูเรื่องด่วน', text: 'งานของฉัน' },
        { label: '📊 ภาพรวม', text: 'สถานะงาน' },
      ]),
    ];
  }
}
