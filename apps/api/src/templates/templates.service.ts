import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import fontkit from '@pdf-lib/fontkit';

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN_L = 72;
const MARGIN_R = 72;
const MARGIN_T = 60;

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);
  private sarabunRegular: Buffer | null = null;
  private sarabunBold: Buffer | null = null;

  constructor() {
    try {
      const fontsDir = path.resolve(__dirname, '../../stamps/fonts');
      this.sarabunRegular = fs.readFileSync(path.join(fontsDir, 'Sarabun-Regular.ttf'));
      this.sarabunBold = fs.readFileSync(path.join(fontsDir, 'Sarabun-Bold.ttf'));
    } catch {
      this.logger.warn('Sarabun fonts not found, will use fallback');
    }
  }

  /**
   * แบบที่ 1 — หนังสือภายนอก (กระดาษครุฑ)
   */
  async generateKrut(data: {
    documentNo?: string;
    orgName: string;
    orgAddress?: string;
    date?: string;
    recipient?: string;
    subject?: string;
    reference?: string;
    body?: string;
    closing?: string;
    signerName?: string;
    signerPosition?: string;
    department?: string;
    phone?: string;
  }): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const page = doc.addPage([A4_W, A4_H]);
    const { regular, bold } = await this.embedFonts(doc);
    let y = A4_H - MARGIN_T;

    // ที่
    if (data.documentNo) {
      page.drawText(`ที่ ${data.documentNo}`, { x: MARGIN_L, y, size: 14, font: regular });
    }
    y -= 20;

    // ส่วนราชการ
    page.drawText(data.orgName, { x: MARGIN_L, y, size: 14, font: regular });
    y -= 16;
    if (data.orgAddress) {
      page.drawText(data.orgAddress, { x: MARGIN_L, y, size: 12, font: regular });
      y -= 16;
    }
    y -= 8;

    // วันที่
    if (data.date) {
      const dateX = A4_W / 2 - 50;
      page.drawText(data.date, { x: dateX, y, size: 14, font: regular });
      y -= 24;
    }

    // เรื่อง
    if (data.subject) {
      page.drawText(`เรื่อง  ${data.subject}`, { x: MARGIN_L, y, size: 14, font: regular });
      y -= 20;
    }

    // เรียน
    if (data.recipient) {
      page.drawText(`เรียน  ${data.recipient}`, { x: MARGIN_L, y, size: 14, font: regular });
      y -= 20;
    }

    // อ้างถึง
    if (data.reference) {
      page.drawText(`อ้างถึง  ${data.reference}`, { x: MARGIN_L, y, size: 14, font: regular });
      y -= 20;
    }

    y -= 8;

    // เนื้อหา
    if (data.body) {
      const lines = this.wrapText(data.body, regular, 14, A4_W - MARGIN_L - MARGIN_R);
      for (const line of lines) {
        if (y < 100) break;
        page.drawText(line, { x: MARGIN_L + 36, y, size: 14, font: regular });
        y -= 20;
      }
    }

    y -= 16;

    // คำลงท้าย
    if (data.closing) {
      const closingX = A4_W / 2 - 30;
      page.drawText(data.closing, { x: closingX, y, size: 14, font: regular });
      y -= 60;
    }

    // ลงชื่อ
    if (data.signerName) {
      const nameX = A4_W / 2 - 40;
      page.drawText(`(${data.signerName})`, { x: nameX, y, size: 14, font: regular });
      y -= 18;
    }
    if (data.signerPosition) {
      const posX = A4_W / 2 - 60;
      page.drawText(data.signerPosition, { x: posX, y, size: 14, font: regular });
      y -= 24;
    }

    // ส่วนราชการเจ้าของเรื่อง
    y = 80;
    if (data.department) {
      page.drawText(data.department, { x: MARGIN_L, y, size: 11, font: regular, color: rgb(0.4, 0.4, 0.4) });
      y -= 14;
    }
    if (data.phone) {
      page.drawText(`โทร. ${data.phone}`, { x: MARGIN_L, y, size: 11, font: regular, color: rgb(0.4, 0.4, 0.4) });
    }

    return Buffer.from(await doc.save());
  }

  /**
   * แบบที่ 2 — บันทึกข้อความ (หนังสือภายใน)
   */
  async generateMemo(data: {
    department?: string;
    documentNo?: string;
    date?: string;
    subject?: string;
    recipient?: string;
    body?: string;
    signerName?: string;
    signerPosition?: string;
  }): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const page = doc.addPage([A4_W, A4_H]);
    const { regular, bold } = await this.embedFonts(doc);
    let y = A4_H - MARGIN_T;

    // Header
    page.drawText('บันทึกข้อความ', { x: A4_W / 2 - 50, y, size: 20, font: bold });
    y -= 30;

    // ส่วนราชการ
    if (data.department) {
      page.drawText(`ส่วนราชการ  ${data.department}`, { x: MARGIN_L, y, size: 14, font: regular });
      y -= 20;
    }

    // ที่
    if (data.documentNo) {
      page.drawText(`ที่  ${data.documentNo}`, { x: MARGIN_L, y, size: 14, font: regular });
      if (data.date) {
        page.drawText(`วันที่  ${data.date}`, { x: 350, y, size: 14, font: regular });
      }
      y -= 20;
    }

    // เรื่อง
    if (data.subject) {
      page.drawText(`เรื่อง  ${data.subject}`, { x: MARGIN_L, y, size: 14, font: regular });
      y -= 20;
    }

    // เรียน
    if (data.recipient) {
      page.drawText(`เรียน  ${data.recipient}`, { x: MARGIN_L, y, size: 14, font: regular });
      y -= 24;
    }

    // เนื้อหา
    if (data.body) {
      const lines = this.wrapText(data.body, regular, 14, A4_W - MARGIN_L - MARGIN_R);
      for (const line of lines) {
        if (y < 120) break;
        page.drawText(line, { x: MARGIN_L + 36, y, size: 14, font: regular });
        y -= 20;
      }
    }

    y -= 40;

    // ลงชื่อ
    if (data.signerName) {
      const nameX = A4_W / 2 - 40;
      page.drawText(`(${data.signerName})`, { x: nameX, y, size: 14, font: regular });
      y -= 18;
    }
    if (data.signerPosition) {
      const posX = A4_W / 2 - 60;
      page.drawText(data.signerPosition, { x: posX, y, size: 14, font: regular });
    }

    return Buffer.from(await doc.save());
  }

  /**
   * แบบที่ 3 — หนังสือประทับตรา
   */
  async generateStampLetter(data: {
    documentNo?: string;
    recipient?: string;
    body?: string;
    orgName: string;
    date?: string;
  }): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const page = doc.addPage([A4_W, A4_H]);
    const { regular, bold } = await this.embedFonts(doc);
    let y = A4_H - MARGIN_T;

    // ที่
    if (data.documentNo) {
      page.drawText(`ที่ ${data.documentNo}`, { x: MARGIN_L, y, size: 14, font: regular });
    }
    y -= 24;

    // ถึง
    if (data.recipient) {
      page.drawText(`ถึง  ${data.recipient}`, { x: MARGIN_L, y, size: 14, font: regular });
      y -= 24;
    }

    // เนื้อหา
    if (data.body) {
      const lines = this.wrapText(data.body, regular, 14, A4_W - MARGIN_L - MARGIN_R);
      for (const line of lines) {
        if (y < 200) break;
        page.drawText(line, { x: MARGIN_L + 36, y, size: 14, font: regular });
        y -= 20;
      }
    }

    y -= 40;

    // ชื่อส่วนราชการ + วันที่
    const centerX = A4_W / 2 - 60;
    page.drawText(data.orgName, { x: centerX, y, size: 14, font: bold });
    y -= 20;
    if (data.date) {
      page.drawText(data.date, { x: centerX, y, size: 14, font: regular });
    }

    // ตำแหน่งสำหรับประทับตรา (วงกลม placeholder)
    y -= 50;
    page.drawText('[ประทับตราส่วนราชการ]', { x: centerX - 20, y, size: 11, font: regular, color: rgb(0.6, 0.6, 0.6) });

    return Buffer.from(await doc.save());
  }

  /**
   * แบบที่ 4 — คำสั่ง / ประกาศ
   * - คำสั่ง: header centered "คำสั่ง<orgName>", ลำดับเลขคำสั่ง, ข้อความเป็นข้อ ๆ
   * - ประกาศ: header centered "ประกาศ<orgName>", เนื้อหาเป็นย่อหน้า ปิดด้วย "ประกาศ ณ วันที่..."
   */
  async generateDirective(data: {
    orgName: string;
    subject?: string;
    body?: string;
    date?: string;
    signerName?: string;
    signerPosition?: string;
    directiveType?: string; // 'คำสั่ง' | 'ประกาศ'
    orderNo?: string; // สำหรับคำสั่ง: "ที่ ๑/๒๕๖๘"
  }): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const page = doc.addPage([A4_W, A4_H]);
    const { regular, bold } = await this.embedFonts(doc);
    let y = A4_H - MARGIN_T;
    const type = data.directiveType ?? 'คำสั่ง';
    const isOrder = type === 'คำสั่ง';

    // Header centered — "คำสั่ง<orgName>" หรือ "ประกาศ<orgName>"
    const headerText = `${type}${data.orgName}`;
    const headerWidth = bold.widthOfTextAtSize(headerText, 18);
    page.drawText(headerText, {
      x: (A4_W - headerWidth) / 2,
      y,
      size: 18,
      font: bold,
    });
    y -= 24;

    // สำหรับคำสั่ง: แสดงเลขที่คำสั่ง (ถ้ามี)
    if (isOrder && data.orderNo) {
      const noWidth = regular.widthOfTextAtSize(data.orderNo, 14);
      page.drawText(data.orderNo, { x: (A4_W - noWidth) / 2, y, size: 14, font: regular });
      y -= 20;
    }

    // เรื่อง centered
    if (data.subject) {
      const subjText = `เรื่อง  ${data.subject}`;
      const subjWidth = regular.widthOfTextAtSize(subjText, 14);
      page.drawText(subjText, { x: (A4_W - subjWidth) / 2, y, size: 14, font: regular });
      y -= 24;
    }

    // เส้นคั่นใต้หัวเรื่อง
    page.drawLine({
      start: { x: A4_W / 2 - 30, y },
      end: { x: A4_W / 2 + 30, y },
      thickness: 0.6,
      color: rgb(0, 0, 0),
    });
    y -= 20;

    // เนื้อหา
    if (data.body) {
      const lines = this.wrapText(data.body, regular, 14, A4_W - MARGIN_L - MARGIN_R);
      for (const line of lines) {
        if (y < 140) break;
        page.drawText(line, { x: MARGIN_L + 36, y, size: 14, font: regular });
        y -= 20;
      }
    }

    y -= 16;

    // วันที่ — "สั่ง ณ วันที่..." สำหรับคำสั่ง, "ประกาศ ณ วันที่..." สำหรับประกาศ
    if (data.date) {
      const dateLabel = isOrder ? 'สั่ง' : 'ประกาศ';
      const dateText = `${dateLabel} ณ วันที่  ${data.date}`;
      const dateX = A4_W / 2 + 20; // ชิดขวาเล็กน้อย
      page.drawText(dateText, { x: dateX, y, size: 14, font: regular });
      y -= 50;
    }

    // ลงชื่อ
    if (data.signerName) {
      const sigLabel = `(${data.signerName})`;
      const sigWidth = regular.widthOfTextAtSize(sigLabel, 14);
      page.drawText(sigLabel, { x: A4_W / 2 + 80 - sigWidth / 2, y, size: 14, font: regular });
      y -= 18;
    }
    if (data.signerPosition) {
      const posWidth = regular.widthOfTextAtSize(data.signerPosition, 14);
      page.drawText(data.signerPosition, { x: A4_W / 2 + 80 - posWidth / 2, y, size: 14, font: regular });
    }

    return Buffer.from(await doc.save());
  }

  // ─── Helpers ─────────────────────────────

  private async embedFonts(doc: PDFDocument) {
    if (this.sarabunRegular && this.sarabunBold) {
      const regular = await doc.embedFont(this.sarabunRegular, { subset: false });
      const bold = await doc.embedFont(this.sarabunBold, { subset: false });
      return { regular, bold };
    }
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    return { regular, bold };
  }

  private wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    const paragraphs = text.split('\n');
    for (const para of paragraphs) {
      if (!para.trim()) { lines.push(''); continue; }
      const words = para.split(/\s+/);
      let current = '';
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        try {
          const w = font.widthOfTextAtSize(test, size);
          if (w > maxWidth && current) {
            lines.push(current);
            current = word;
          } else {
            current = test;
          }
        } catch {
          current = test;
        }
      }
      if (current) lines.push(current);
    }
    return lines;
  }
}
