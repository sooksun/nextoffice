/**
 * TemplatesService — renders Thai government letter templates (ระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ)
 *
 * ใช้ @napi-rs/canvas (Skia + HarfBuzz) render PNG แล้ว embed ลง PDF ผ่าน pdf-lib
 * ทำให้สระ/วรรณยุกต์ภาษาไทยอยู่ในตำแหน่งที่ถูกต้อง
 *
 * มาตรฐานการจัดพิมพ์:
 *  - กระดาษ A4
 *  - ฟอนต์: TH Sarabun New / Sarabun  ขนาด 16pt (เนื้อหา), 29pt bold (หัว บันทึก)
 *  - กั้นหน้า 3 ซม. (85.05 pt), กั้นหลัง 2 ซม. (56.7 pt)
 *  - ครุฑสูง 3 ซม. (หนังสือภายนอก), 1.5 ซม. (หนังสือภายใน)
 *  - ครุฑห่างขอบบนกระดาษ 1.5 ซม.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createCanvas, GlobalFonts, Canvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

// ─── Unit conversions ────────────────────────────────────────────────────────
const DPI = 150;
const PX_PER_PT = DPI / 72;          // 1 PDF point → canvas pixels (≈ 2.0833)
const CM = 28.3465;                   // 1 cm in PDF points

/** Convert PDF points → canvas pixels */
function px(pt: number): number { return Math.round(pt * PX_PER_PT); }
/** Convert cm → canvas pixels */
function cm(c: number): number { return px(c * CM); }

// ─── A4 canvas dimensions ─────────────────────────────────────────────────────
const A4_PT_W = 595.28;
const A4_PT_H = 841.89;
const CW = Math.round(A4_PT_W * PX_PER_PT); // ≈ 1240 px
const CH = Math.round(A4_PT_H * PX_PER_PT); // ≈ 1754 px

// ─── Margins (ระเบียบสารบรรณ) ────────────────────────────────────────────────
const ML   = cm(3);     // กั้นหน้า 3 ซม.
const MR   = cm(2);     // กั้นหลัง 2 ซม.
const MT   = cm(2.5);   // ระยะบน
const MB   = cm(2);     // ระยะล่าง
const CONTENT_W = CW - ML - MR;
const INDENT    = cm(1.25); // ย่อหน้า ~2.5 ซม. (ใช้ครึ่งหนึ่งเพราะ x เริ่มที่ ML แล้ว)

// ─── Font sizes (pt) ──────────────────────────────────────────────────────────
const FS_BODY   = 19;   // ขนาดเนื้อหาทั่วไป (19pt ตามผู้ใช้กำหนด)
const FS_LABEL  = 19;   // ขนาด label (เรื่อง เรียน ฯลฯ)
const FS_HEADER = 29;   // หัว "บันทึกข้อความ"
const FS_TITLE  = 18;   // ชื่อหนังสือสั่งการ / ประกาศ
const FS_SMALL  = 14;   // ข้อมูลล่าง / footnote

// ─── Line height ──────────────────────────────────────────────────────────────
const LH = px(24); // line height at 16pt (single-spaced ≈ 1.5×font)

// ─── Garuda image path ────────────────────────────────────────────────────────
const GARUDA_PATH = path.resolve(__dirname, '../stamps/fonts/kruth02.png');

// ─── Font family ──────────────────────────────────────────────────────────────
const FONT_FAMILY = 'Sarabun';

// ─────────────────────────────────────────────────────────────────────────────
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor() {
    try {
      const fontsDir = path.resolve(__dirname, '../stamps/fonts');
      GlobalFonts.registerFromPath(path.join(fontsDir, 'Sarabun-Regular.ttf'), FONT_FAMILY);
      GlobalFonts.registerFromPath(path.join(fontsDir, 'Sarabun-Bold.ttf'), FONT_FAMILY);
      this.logger.log('Sarabun fonts registered');
    } catch (err: any) {
      this.logger.error(`Font registration failed: ${err?.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // แบบที่ 1 — หนังสือภายนอก (External Communication — กระดาษครุฑ)
  // ระเบียบ ข้อ 11 / แบบที่ 1
  // ═══════════════════════════════════════════════════════════════════════════
  async generateKrut(data: {
    documentNo?: string;
    orgName?: string;
    orgAddress?: string;
    date?: string;
    recipient?: string;
    subject?: string;
    reference?: string;
    enclosure?: string;
    body?: string;
    closing?: string;
    signerName?: string;
    signerPosition?: string;
    department?: string;
    phone?: string;
    email?: string;
  }): Promise<Buffer> {
    const { canvas, ctx } = this.newCanvas();
    let y = MT;

    // ── ครุฑ (3 ซม. สูง, 1.5 ซม. จากขอบบน, กลางหน้า) ──────────────────────
    const garudaH = cm(3);
    y = await this.drawGaruda(ctx, garudaH, y);
    y += px(6);

    // ── ที่ (ซ้าย) / ส่วนราชการ (ขวา) ──────────────────────────────────────
    const yMeta = y;
    if (data.documentNo) {
      this.text(ctx, `ที่  ${data.documentNo}`, ML, yMeta, FS_BODY);
    }
    if (data.orgName) {
      const tw = this.measure(ctx, data.orgName, FS_BODY);
      this.text(ctx, data.orgName, CW - MR - tw, yMeta, FS_BODY);
    }
    y += LH;

    // ── วันที่ (กึ่งกลางขวา) ──────────────────────────────────────────────
    if (data.date) {
      const dw = this.measure(ctx, data.date, FS_BODY);
      this.text(ctx, data.date, CW - MR - dw, y, FS_BODY);
    }
    if (data.orgAddress) {
      this.text(ctx, data.orgAddress, ML, y, FS_SMALL, false, '#444444');
    }
    y += LH * 1.5;

    // ── เรื่อง / เรียน / อ้างถึง / สิ่งที่ส่งมาด้วย ─────────────────────────
    if (data.subject) {
      y = this.drawField(ctx, 'เรื่อง', data.subject, y);
    }
    if (data.recipient) {
      y = this.drawField(ctx, 'เรียน', data.recipient, y);
    }
    if (data.reference) {
      y = this.drawField(ctx, 'อ้างถึง', data.reference, y);
    }
    if (data.enclosure) {
      y = this.drawField(ctx, 'สิ่งที่ส่งมาด้วย', data.enclosure, y);
    }
    y += px(6);

    // ── เนื้อหา (ย่อหน้า 2.5 ซม.) ──────────────────────────────────────────
    if (data.body) {
      y = this.drawBody(ctx, data.body, ML, y, FS_BODY, CONTENT_W);
    }
    y += LH;

    // ── คำลงท้าย (กึ่งกลาง) ──────────────────────────────────────────────
    if (data.closing) {
      const cw = this.measure(ctx, data.closing, FS_BODY);
      this.text(ctx, data.closing, (CW - cw) / 2, y, FS_BODY);
      y += LH * 3.5; // เว้นช่องว่างสำหรับลายเซ็น
    }

    // ── ลงชื่อ / ตำแหน่ง (กึ่งกลาง) ────────────────────────────────────────
    y = this.drawSignature(ctx, data.signerName, data.signerPosition, y);

    // ── ข้อมูลติดต่อ (มุมล่างซ้าย) ──────────────────────────────────────────
    this.drawContactFooter(ctx, data.department, data.phone, data.email);

    return this.toPdf(canvas);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // แบบที่ 2 — หนังสือภายใน / บันทึกข้อความ (Internal Memorandum)
  // ระเบียบ ข้อ 12 / แบบที่ 2
  // ═══════════════════════════════════════════════════════════════════════════
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
    const { canvas, ctx } = this.newCanvas();
    let y = MT;

    // ── ครุฑ 1.5 ซม. (ซ้าย) + "บันทึกข้อความ" (กึ่งกลาง) ──────────────────
    const garudaH = cm(1.5);
    const garudaW = garudaH; // aspect ≈ 1:1 สำหรับครุฑ
    await this.drawGarudaAt(ctx, ML, y, garudaW, garudaH);

    const headerText = 'บันทึกข้อความ';
    const hw = this.measure(ctx, headerText, FS_HEADER, true);
    this.text(ctx, headerText, (CW - hw) / 2, y + px(2), FS_HEADER, true);
    y += garudaH + px(10);

    // ── เส้นคั่น ──────────────────────────────────────────────────────────
    this.drawHRule(ctx, ML, CW - MR, y, 1.5);
    y += px(14);

    // ── เมตาข้อมูล ──────────────────────────────────────────────────────────
    if (data.department) {
      y = this.drawField(ctx, 'ส่วนราชการ', data.department, y);
    }
    // ที่ + วันที่ (แถวเดียวกัน)
    const yDocRow = y;
    if (data.documentNo) {
      this.text(ctx, `ที่  ${data.documentNo}`, ML, yDocRow, FS_BODY);
    }
    if (data.date) {
      const dLabel = `วันที่  ${data.date}`;
      this.text(ctx, dLabel, ML + CONTENT_W / 2, yDocRow, FS_BODY);
    }
    if (data.documentNo || data.date) y += LH;

    if (data.subject) {
      y = this.drawField(ctx, 'เรื่อง', data.subject, y);
    }
    if (data.recipient) {
      y = this.drawField(ctx, 'เรียน', data.recipient, y);
    }
    y += px(6);

    // ── เนื้อหา ──────────────────────────────────────────────────────────────
    if (data.body) {
      y = this.drawBody(ctx, data.body, ML, y, FS_BODY, CONTENT_W);
    }
    y += LH * 2.5;

    // ── ลงชื่อ / ตำแหน่ง ────────────────────────────────────────────────────
    this.drawSignature(ctx, data.signerName, data.signerPosition, y);

    return this.toPdf(canvas);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // แบบที่ 3 — หนังสือประทับตรา (Stamped Letter)
  // ระเบียบ ข้อ 13–14 / แบบที่ 4
  // ═══════════════════════════════════════════════════════════════════════════
  async generateStampLetter(data: {
    documentNo?: string;
    recipient?: string;
    body?: string;
    orgName: string;
    date?: string;
    department?: string;
    phone?: string;
  }): Promise<Buffer> {
    const { canvas, ctx } = this.newCanvas();
    let y = MT;

    // ── ครุฑ (3 ซม.) ──────────────────────────────────────────────────────
    const garudaH = cm(3);
    y = await this.drawGaruda(ctx, garudaH, y);
    y += px(6);

    // ── ที่ ──────────────────────────────────────────────────────────────────
    if (data.documentNo) {
      this.text(ctx, `ที่  ${data.documentNo}`, ML, y, FS_BODY);
      y += LH;
    }

    // ── ถึง ──────────────────────────────────────────────────────────────────
    if (data.recipient) {
      y = this.drawField(ctx, 'ถึง', data.recipient, y);
    }
    y += px(6);

    // ── เนื้อหา ──────────────────────────────────────────────────────────────
    if (data.body) {
      y = this.drawBody(ctx, data.body, ML, y, FS_BODY, CONTENT_W);
    }
    y += LH * 3;

    // ── ตรา + ชื่อหน่วยงาน (กึ่งกลาง) ────────────────────────────────────
    // (ในระบบ digital แสดงชื่อหน่วยงานแทนการประทับตรา)
    this.drawStampBox(ctx, data.orgName, y);
    y += cm(5.5);

    if (data.date) {
      const dw = this.measure(ctx, data.date, FS_BODY);
      this.text(ctx, data.date, (CW - dw) / 2, y, FS_BODY);
      y += LH;
    }

    // ── ข้อมูลติดต่อ ──────────────────────────────────────────────────────
    this.drawContactFooter(ctx, data.department, data.phone);

    return this.toPdf(canvas);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // แบบที่ 4 — หนังสือสั่งการ: คำสั่ง / ระเบียบ / ข้อบังคับ
  // ระเบียบ ข้อ 15–17 / แบบที่ 5–7
  // ═══════════════════════════════════════════════════════════════════════════
  async generateDirective(data: {
    orgName: string;
    subject?: string;
    body?: string;
    date?: string;
    signerName?: string;
    signerPosition?: string;
    directiveType?: 'คำสั่ง' | 'ระเบียบ' | 'ข้อบังคับ';
    orderNo?: string;
    preamble?: string; // อาศัยอำนาจตาม...
  }): Promise<Buffer> {
    const { canvas, ctx } = this.newCanvas();
    let y = MT;
    const type = data.directiveType ?? 'คำสั่ง';

    // ── ครุฑ (3 ซม.) ──────────────────────────────────────────────────────
    const garudaH = cm(3);
    y = await this.drawGaruda(ctx, garudaH, y);
    y += px(8);

    // ── หัวเรื่อง ──────────────────────────────────────────────────────────
    const headerLine = `${type}${data.orgName}`;
    const hw = this.measure(ctx, headerLine, FS_TITLE, true);
    this.text(ctx, headerLine, (CW - hw) / 2, y, FS_TITLE, true);
    y += px(28);

    if (data.orderNo) {
      const nw = this.measure(ctx, data.orderNo, FS_BODY);
      this.text(ctx, data.orderNo, (CW - nw) / 2, y, FS_BODY);
      y += LH;
    }
    if (data.subject) {
      const sw = this.measure(ctx, `เรื่อง  ${data.subject}`, FS_BODY);
      this.text(ctx, `เรื่อง  ${data.subject}`, (CW - sw) / 2, y, FS_BODY);
      y += LH;
    }

    // ── เส้นคั่นสั้น ──────────────────────────────────────────────────────
    const lineLen = cm(2);
    this.drawHRule(ctx, CW / 2 - lineLen, CW / 2 + lineLen, y + px(4), 0.8);
    y += px(20);

    // ── คำปรารภ (อาศัยอำนาจตาม...) ──────────────────────────────────────
    if (data.preamble) {
      y = this.drawBody(ctx, data.preamble, ML, y, FS_BODY, CONTENT_W);
      y += px(4);
    }

    // ── เนื้อหา ──────────────────────────────────────────────────────────
    if (data.body) {
      y = this.drawBody(ctx, data.body, ML, y, FS_BODY, CONTENT_W);
    }
    y += LH;

    // ── วันที่สั่ง (ขวา) ──────────────────────────────────────────────────
    if (data.date) {
      const verb = type === 'คำสั่ง' ? 'สั่ง' : 'ประกาศ';
      const dateText = `${verb} ณ วันที่  ${data.date}`;
      const dtw = this.measure(ctx, dateText, FS_BODY);
      this.text(ctx, dateText, CW - MR - dtw, y, FS_BODY);
      y += LH * 3.5;
    }

    // ── ลงชื่อ / ตำแหน่ง (ขวา) ────────────────────────────────────────────
    this.drawSignatureRight(ctx, data.signerName, data.signerPosition, y);

    return this.toPdf(canvas);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // แบบที่ 5 — หนังสือประชาสัมพันธ์: ประกาศ / แถลงการณ์ / ข่าว
  // ระเบียบ ข้อ 18–20 / แบบที่ 8–10
  // ═══════════════════════════════════════════════════════════════════════════
  async generatePublicRelation(data: {
    orgName: string;
    prType?: 'ประกาศ' | 'แถลงการณ์' | 'ข่าว';
    subject?: string;
    body?: string;
    date?: string;
    signerName?: string;
    signerPosition?: string;
  }): Promise<Buffer> {
    const { canvas, ctx } = this.newCanvas();
    let y = MT;
    const type = data.prType ?? 'ประกาศ';

    // ประกาศใช้กระดาษครุฑ; แถลงการณ์/ข่าวอาจไม่มี
    if (type === 'ประกาศ') {
      const garudaH = cm(3);
      y = await this.drawGaruda(ctx, garudaH, y);
      y += px(8);
    } else {
      y += px(8);
    }

    // ── หัว: "ประกาศ[ชื่อหน่วยงาน]" บรรทัดเดียว ─────────────────────────────
    const headerLine = `${type}${data.orgName}`;
    const hw = this.measure(ctx, headerLine, FS_TITLE, true);
    this.text(ctx, headerLine, (CW - hw) / 2, y, FS_TITLE, true);
    y += px(30);

    // ── เรื่อง — ตัด prefix ซ้ำออก (ถ้า subject เริ่มด้วย "ประกาศ[orgName] เรื่อง") ──
    if (data.subject) {
      let subj = data.subject.trim();
      // strip redundant "ประกาศ[orgName]" prefix (กรณี data มาจาก AI ที่ใส่มาซ้ำ)
      const redundantPrefix = `${type}${data.orgName}`;
      if (subj.startsWith(redundantPrefix)) {
        subj = subj.slice(redundantPrefix.length).trim();
      }
      // strip นำหน้า "เรื่อง" ที่ซ้ำ
      subj = subj.replace(/^เรื่อง\s+/, '').trim();

      if (subj) {
        const sw = this.measure(ctx, `เรื่อง  ${subj}`, FS_BODY);
        this.text(ctx, `เรื่อง  ${subj}`, (CW - sw) / 2, y, FS_BODY);
        y += LH * 1.5;
      }
    }

    // ── เส้นคั่น ──────────────────────────────────────────────────────────
    this.drawHRule(ctx, ML, CW - MR, y, 0.8);
    y += px(14);

    // ── เนื้อหา ──────────────────────────────────────────────────────────
    if (data.body) {
      y = this.drawBody(ctx, data.body, ML, y, FS_BODY, CONTENT_W);
    }
    y += LH;

    // ── วันที่ + ลงชื่อ ──────────────────────────────────────────────────
    if (data.date) {
      const verb = type === 'ประกาศ' ? 'ประกาศ ณ วันที่' : 'วันที่';
      const dtw = this.measure(ctx, `${verb}  ${data.date}`, FS_BODY);
      this.text(ctx, `${verb}  ${data.date}`, CW - MR - dtw, y, FS_BODY);
      y += LH * 3.5;
    }

    this.drawSignatureRight(ctx, data.signerName, data.signerPosition, y);

    return this.toPdf(canvas);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // แบบที่ 6 — หนังสือรับรอง (Certificate) — ใต้ประเภทที่ 6
  // ═══════════════════════════════════════════════════════════════════════════
  async generateCertificate(data: {
    orgName: string;
    orgAddress?: string;
    documentNo?: string;
    date?: string;
    subject?: string;
    recipientTitle?: string;  // เรื่องที่รับรอง
    body?: string;
    signerName?: string;
    signerPosition?: string;
    phone?: string;
  }): Promise<Buffer> {
    const { canvas, ctx } = this.newCanvas();
    let y = MT;

    // ── ครุฑ ──────────────────────────────────────────────────────────────
    const garudaH = cm(3);
    y = await this.drawGaruda(ctx, garudaH, y);
    y += px(6);

    // ── หัวหนังสือ ────────────────────────────────────────────────────────
    if (data.documentNo) {
      this.text(ctx, `ที่  ${data.documentNo}`, ML, y, FS_BODY);
    }
    if (data.orgName) {
      const tw = this.measure(ctx, data.orgName, FS_BODY, true);
      this.text(ctx, data.orgName, (CW - tw) / 2, y, FS_BODY, true);
    }
    y += LH;

    if (data.orgAddress) {
      const aw = this.measure(ctx, data.orgAddress, FS_SMALL);
      this.text(ctx, data.orgAddress, (CW - aw) / 2, y, FS_SMALL, false, '#444');
      y += LH;
    }
    if (data.date) {
      const dw = this.measure(ctx, data.date, FS_BODY);
      this.text(ctx, data.date, CW - MR - dw, y, FS_BODY);
    }
    y += LH * 1.5;

    // ── หัว "หนังสือรับรอง" (กึ่งกลาง) ──────────────────────────────────
    const certTitle = 'หนังสือรับรอง';
    const ctw = this.measure(ctx, certTitle, FS_TITLE, true);
    this.text(ctx, certTitle, (CW - ctw) / 2, y, FS_TITLE, true);
    y += px(28);

    if (data.subject) {
      const stw = this.measure(ctx, data.subject, FS_BODY);
      this.text(ctx, data.subject, (CW - stw) / 2, y, FS_BODY);
      y += LH * 1.5;
    }

    // ── เส้นคั่น ──────────────────────────────────────────────────────────
    this.drawHRule(ctx, ML, CW - MR, y, 1);
    y += px(14);

    // ── เนื้อหา ──────────────────────────────────────────────────────────
    if (data.body) {
      y = this.drawBody(ctx, data.body, ML, y, FS_BODY, CONTENT_W);
    }
    y += LH * 2;

    // ── ลงชื่อ / ตำแหน่ง ─────────────────────────────────────────────────
    this.drawSignature(ctx, data.signerName, data.signerPosition, y);

    // ── ข้อมูลติดต่อ ────────────────────────────────────────────────────
    this.drawContactFooter(ctx, undefined, data.phone);

    return this.toPdf(canvas);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private newCanvas(): { canvas: Canvas; ctx: any } {
    const canvas = createCanvas(CW, CH);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
    return { canvas, ctx };
  }

  private font(size: number, bold = false): string {
    return `${bold ? '700' : '400'} ${px(size)}px "${FONT_FAMILY}"`;
  }

  private text(
    ctx: any,
    str: string,
    x: number,
    y: number,
    size: number,
    bold = false,
    color = '#000000',
  ): void {
    ctx.font = this.font(size, bold);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.fillStyle = '#000000';
  }

  private measure(ctx: any, str: string, size: number, bold = false): number {
    ctx.font = this.font(size, bold);
    return ctx.measureText(str).width;
  }

  /** วาดครุฑตรงกลางหน้า, return y ล่างสุดของครุฑ */
  private async drawGaruda(ctx: any, garudaH: number, topY: number): Promise<number> {
    if (!fs.existsSync(GARUDA_PATH)) {
      // fallback: วาด placeholder เส้น
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(CW / 2 - garudaH / 2, topY, garudaH, garudaH);
      return topY + garudaH;
    }
    try {
      const img = await loadImage(GARUDA_PATH);
      const aspect = img.width / img.height;
      const garudaW = Math.round(garudaH * aspect);
      const x = Math.round((CW - garudaW) / 2);
      ctx.drawImage(img, x, topY, garudaW, garudaH);
      return topY + garudaH;
    } catch {
      return topY + garudaH;
    }
  }

  /** วาดครุฑที่ตำแหน่ง x,y กำหนดเอง */
  private async drawGarudaAt(ctx: any, x: number, y: number, w: number, h: number): Promise<void> {
    if (!fs.existsSync(GARUDA_PATH)) return;
    try {
      const img = await loadImage(GARUDA_PATH);
      ctx.drawImage(img, x, y, w, h);
    } catch { /* skip */ }
  }

  /** วาดกล่องตรายาง (หนังสือประทับตรา) */
  private drawStampBox(ctx: any, orgName: string, y: number): void {
    const outerR = cm(4.5 / 2);
    const innerR = cm(3.5 / 2);
    const cx = CW / 2;
    const cy = y + outerR;

    // วงนอก
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.stroke();
    // วงใน
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.stroke();

    // ชื่อหน่วยงานในวง
    ctx.save();
    ctx.font = this.font(FS_SMALL, true);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = this.wrapSimple(ctx, orgName, FS_SMALL, innerR * 1.6);
    const lineStep = px(FS_SMALL + 4);
    const startY = cy - (lines.length - 1) * lineStep / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, cx, startY + i * lineStep);
    });
    ctx.restore();
    ctx.textBaseline = 'top';
  }

  /** วาดเส้นคั่นแนวนอน */
  private drawHRule(ctx: any, x1: number, x2: number, y: number, lineWidth = 1): void {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  }

  /** วาด label field "เรื่อง ...", "เรียน ...", "อ้างถึง ..." แบบ wrap */
  private drawField(ctx: any, label: string, value: string, y: number): number {
    const labelText = `${label}  `;
    const lw = this.measure(ctx, labelText, FS_LABEL);
    const valueW = CONTENT_W - lw;
    const lines = this.wrapText(ctx, value, FS_BODY, valueW);

    for (let i = 0; i < lines.length; i++) {
      if (i === 0) {
        this.text(ctx, labelText, ML, y, FS_LABEL, false);
        this.text(ctx, lines[i], ML + lw, y, FS_BODY);
      } else {
        this.text(ctx, lines[i], ML + lw, y, FS_BODY);
      }
      y += LH;
    }
    return y;
  }

  /**
   * วาดเนื้อหาหลายย่อหน้า
   * - บรรทัดแรกของแต่ละย่อหน้า ย่อหน้า INDENT
   * - บรรทัดถัดไปไม่ย่อ
   * Returns ค่า y ถัดไป
   */
  private drawBody(
    ctx: any,
    body: string,
    x: number,
    y: number,
    size: number,
    maxW: number,
  ): number {
    const normalized = body.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    let firstInPara = true;

    for (const para of normalized.split('\n')) {
      if (!para.trim()) {
        y += px(6);
        firstInPara = true;
        continue;
      }
      const lines = this.wrapText(ctx, para, size, maxW - INDENT);
      for (let i = 0; i < lines.length; i++) {
        if (y + px(size) > CH - MB) break;
        // ย่อหน้าแรกของแต่ละ paragraph
        const lineX = (firstInPara && i === 0) ? x + INDENT : x + INDENT;
        this.text(ctx, lines[i], lineX, y, size);
        y += LH;
      }
      firstInPara = false;
    }
    return y;
  }

  /** ลงชื่อ + ตำแหน่ง กึ่งกลาง */
  private drawSignature(
    ctx: any,
    signerName?: string,
    signerPosition?: string,
    y: number = 0,
  ): number {
    if (signerName) {
      const label = `(${signerName})`;
      const lw = this.measure(ctx, label, FS_BODY);
      this.text(ctx, label, (CW - lw) / 2, y, FS_BODY);
      y += LH;
    }
    if (signerPosition) {
      const lines = this.wrapText(ctx, signerPosition, FS_BODY, CONTENT_W);
      for (const line of lines) {
        const pw = this.measure(ctx, line, FS_BODY);
        this.text(ctx, line, (CW - pw) / 2, y, FS_BODY);
        y += LH;
      }
    }
    return y;
  }

  /** ลงชื่อ + ตำแหน่ง ชิดขวา (สำหรับ คำสั่ง/ประกาศ) */
  private drawSignatureRight(
    ctx: any,
    signerName?: string,
    signerPosition?: string,
    y: number = 0,
  ): number {
    const rightX = CW / 2 + cm(1);
    const rightW  = CW - MR - rightX;

    if (signerName) {
      const label = `(${signerName})`;
      const lw = this.measure(ctx, label, FS_BODY);
      this.text(ctx, label, rightX + (rightW - lw) / 2, y, FS_BODY);
      y += LH;
    }
    if (signerPosition) {
      const lines = this.wrapText(ctx, signerPosition, FS_BODY, rightW);
      for (const line of lines) {
        const pw = this.measure(ctx, line, FS_BODY);
        this.text(ctx, line, rightX + (rightW - pw) / 2, y, FS_BODY);
        y += LH;
      }
    }
    return y;
  }

  /** ข้อมูลติดต่อมุมล่างซ้าย */
  private drawContactFooter(
    ctx: any,
    department?: string,
    phone?: string,
    email?: string,
  ): void {
    let y = CH - MB - (department ? LH : 0) - (phone ? LH : 0) - (email ? LH : 0) - px(4);
    this.drawHRule(ctx, ML, CW - MR, y, 0.5);
    y += px(6);
    if (department) {
      this.text(ctx, department, ML, y, FS_SMALL, false, '#555555');
      y += LH;
    }
    if (phone) {
      this.text(ctx, `โทร. ${phone}`, ML, y, FS_SMALL, false, '#555555');
      y += LH;
    }
    if (email) {
      this.text(ctx, `Email: ${email}`, ML, y, FS_SMALL, false, '#555555');
    }
  }

  /** Word-wrap ข้อความ */
  private wrapText(ctx: any, text: string, size: number, maxW: number): string[] {
    ctx.font = this.font(size);
    const lines: string[] = [];
    const tokens = text.split(/\s+/);
    let cur = '';
    for (const tok of tokens) {
      if (!tok) continue;
      const test = cur ? `${cur} ${tok}` : tok;
      if (ctx.measureText(test).width <= maxW) {
        cur = test;
      } else if (cur) {
        lines.push(cur);
        cur = tok;
      } else {
        // token เดียวยาวกว่า maxW → แตกตามอักขระ
        for (const ch of tok) {
          const testCh = cur + ch;
          if (ctx.measureText(testCh).width > maxW && cur) {
            lines.push(cur); cur = ch;
          } else { cur = testCh; }
        }
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  /** Wrap แบบง่าย (สำหรับตรายาง) */
  private wrapSimple(ctx: any, text: string, size: number, maxW: number): string[] {
    return this.wrapText(ctx, text, size, maxW);
  }

  /** แปลง canvas → PDF buffer */
  private async toPdf(canvas: Canvas): Promise<Buffer> {
    const png = await canvas.encode('png');
    const doc  = await PDFDocument.create();
    const page = doc.addPage([A4_PT_W, A4_PT_H]);
    const img  = await doc.embedPng(png);
    page.drawImage(img, { x: 0, y: 0, width: A4_PT_W, height: A4_PT_H });
    return Buffer.from(await doc.save());
  }
}
