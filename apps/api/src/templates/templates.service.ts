/**
 * TemplatesService — renders Thai government letter templates.
 *
 * Uses @napi-rs/canvas (Skia + HarfBuzz) for correct Thai text shaping,
 * then embeds the rendered PNG page into a pdf-lib PDF.
 * This guarantees สระ/วรรณยุกต์ appear in the correct position.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createCanvas, GlobalFonts, Canvas } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

// ─── Constants ──────────────────────────────────────────────────────────────
/** Render at 150 DPI for crisp output; A4 in PDF points = 595.28 × 841.89 */
const DPI = 150;
const PX_PER_PT = DPI / 72; // 1 PDF point → canvas pixels

const A4_PT_W = 595.28;
const A4_PT_H = 841.89;
const CW = Math.round(A4_PT_W * PX_PER_PT); // canvas width  ~1240
const CH = Math.round(A4_PT_H * PX_PER_PT); // canvas height ~1754

const ML = px(72);  // left margin
const MR = px(72);  // right margin
const MT = px(60);  // top margin
const CONTENT_W = CW - ML - MR;
const INDENT = px(36); // paragraph indent

/** Convert PDF points to canvas pixels */
function px(pt: number): number {
  return Math.round(pt * PX_PER_PT);
}

const FONT_FAMILY = 'Sarabun';

// ─── Service ─────────────────────────────────────────────────────────────────
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor() {
    try {
      const fontsDir = path.resolve(__dirname, '../stamps/fonts');
      // Register both weights under the same family; Skia picks by weight
      GlobalFonts.registerFromPath(
        path.join(fontsDir, 'Sarabun-Regular.ttf'),
        FONT_FAMILY,
      );
      GlobalFonts.registerFromPath(
        path.join(fontsDir, 'Sarabun-Bold.ttf'),
        FONT_FAMILY,
      );
      this.logger.log('Sarabun fonts registered (canvas/Skia)');
    } catch (err: any) {
      this.logger.error(`Failed to register fonts: ${err?.message}`);
    }
  }

  // ─── Public document generators ─────────────────────────────────────────

  /** แบบที่ 1 — หนังสือภายนอก (กระดาษครุฑ) */
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
    const { canvas, ctx } = this.newCanvas();
    let y = MT;

    // ที่
    if (data.documentNo) {
      this.text(ctx, `ที่ ${data.documentNo}`, ML, y, 14);
    }
    y += px(20);

    // ส่วนราชการ
    this.text(ctx, data.orgName, ML, y, 14);
    y += px(18);
    if (data.orgAddress) {
      this.text(ctx, data.orgAddress, ML, y, 12);
      y += px(16);
    }
    y += px(8);

    // วันที่
    if (data.date) {
      const dw = this.measure(ctx, data.date, 14);
      this.text(ctx, data.date, (CW - dw) / 2, y, 14);
      y += px(24);
    }

    // เรื่อง / เรียน / อ้างถึง
    if (data.subject) {
      y = this.drawWrapped(ctx, `เรื่อง  ${data.subject}`, ML, y, 14, CONTENT_W);
      y += px(4);
    }
    if (data.recipient) {
      y = this.drawWrapped(ctx, `เรียน  ${data.recipient}`, ML, y, 14, CONTENT_W);
      y += px(4);
    }
    if (data.reference) {
      y = this.drawWrapped(ctx, `อ้างถึง  ${data.reference}`, ML, y, 14, CONTENT_W);
      y += px(4);
    }
    y += px(8);

    // เนื้อหา
    if (data.body) {
      y = this.drawBody(ctx, data.body, ML + INDENT, y, 14, CONTENT_W - INDENT);
    }
    y += px(16);

    // คำลงท้าย
    if (data.closing) {
      const cw = this.measure(ctx, data.closing, 14);
      this.text(ctx, data.closing, (CW - cw) / 2, y, 14);
      y += px(60);
    }

    // ลงชื่อ
    if (data.signerName) {
      const label = `(${data.signerName})`;
      const lw = this.measure(ctx, label, 14);
      this.text(ctx, label, (CW - lw) / 2, y, 14);
      y += px(18);
    }
    if (data.signerPosition) {
      const pw = this.measure(ctx, data.signerPosition, 14);
      this.text(ctx, data.signerPosition, (CW - pw) / 2, y, 14);
    }

    // ส่วนราชการเจ้าของเรื่อง (bottom)
    let by = CH - MT;
    if (data.department) {
      this.text(ctx, data.department, ML, by, 11, false, '#666666');
      by += px(14);
    }
    if (data.phone) {
      this.text(ctx, `โทร. ${data.phone}`, ML, by, 11, false, '#666666');
    }

    return this.toPdf(canvas);
  }

  /** แบบที่ 2 — บันทึกข้อความ */
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

    // Header
    const header = 'บันทึกข้อความ';
    const hw = this.measure(ctx, header, 20, true);
    this.text(ctx, header, (CW - hw) / 2, y, 20, true);
    y += px(34);

    // Horizontal rule
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ML, y);
    ctx.lineTo(CW - MR, y);
    ctx.stroke();
    y += px(10);

    // เมตา
    if (data.department) {
      y = this.drawWrapped(ctx, `ส่วนราชการ  ${data.department}`, ML, y, 14, CONTENT_W);
      y += px(4);
    }
    if (data.documentNo) {
      this.text(ctx, `ที่  ${data.documentNo}`, ML, y, 14);
      if (data.date) {
        this.text(ctx, `วันที่  ${data.date}`, px(350), y, 14);
      }
      y += px(20);
    }
    if (data.subject) {
      y = this.drawWrapped(ctx, `เรื่อง  ${data.subject}`, ML, y, 14, CONTENT_W);
      y += px(4);
    }
    if (data.recipient) {
      y = this.drawWrapped(ctx, `เรียน  ${data.recipient}`, ML, y, 14, CONTENT_W);
      y += px(4);
    }
    y += px(8);

    // เนื้อหา
    if (data.body) {
      y = this.drawBody(ctx, data.body, ML + INDENT, y, 14, CONTENT_W - INDENT);
    }
    y += px(40);

    // ลงชื่อ
    if (data.signerName) {
      const label = `(${data.signerName})`;
      const lw = this.measure(ctx, label, 14);
      this.text(ctx, label, (CW - lw) / 2, y, 14);
      y += px(18);
    }
    if (data.signerPosition) {
      const pw = this.measure(ctx, data.signerPosition, 14);
      this.text(ctx, data.signerPosition, (CW - pw) / 2, y, 14);
    }

    return this.toPdf(canvas);
  }

  /** แบบที่ 3 — หนังสือประทับตรา */
  async generateStampLetter(data: {
    documentNo?: string;
    recipient?: string;
    body?: string;
    orgName: string;
    date?: string;
  }): Promise<Buffer> {
    const { canvas, ctx } = this.newCanvas();
    let y = MT;

    if (data.documentNo) {
      this.text(ctx, `ที่ ${data.documentNo}`, ML, y, 14);
    }
    y += px(24);

    if (data.recipient) {
      y = this.drawWrapped(ctx, `ถึง  ${data.recipient}`, ML, y, 14, CONTENT_W);
      y += px(8);
    }

    if (data.body) {
      y = this.drawBody(ctx, data.body, ML + INDENT, y, 14, CONTENT_W - INDENT);
    }
    y += px(40);

    const cw2 = this.measure(ctx, data.orgName, 14, true);
    this.text(ctx, data.orgName, (CW - cw2) / 2, y, 14, true);
    y += px(20);
    if (data.date) {
      const dw = this.measure(ctx, data.date, 14);
      this.text(ctx, data.date, (CW - dw) / 2, y, 14);
    }

    return this.toPdf(canvas);
  }

  /** แบบที่ 4 — คำสั่ง / ประกาศ */
  async generateDirective(data: {
    orgName: string;
    subject?: string;
    body?: string;
    date?: string;
    signerName?: string;
    signerPosition?: string;
    directiveType?: string;
    orderNo?: string;
  }): Promise<Buffer> {
    const { canvas, ctx } = this.newCanvas();
    let y = MT;
    const type = data.directiveType ?? 'คำสั่ง';
    const isOrder = type === 'คำสั่ง';

    // Header
    const headerText = `${type}${data.orgName}`;
    const headerW = this.measure(ctx, headerText, 18, true);
    this.text(ctx, headerText, (CW - headerW) / 2, y, 18, true);
    y += px(26);

    if (isOrder && data.orderNo) {
      const noW = this.measure(ctx, data.orderNo, 14);
      this.text(ctx, data.orderNo, (CW - noW) / 2, y, 14);
      y += px(20);
    }

    if (data.subject) {
      const subj = `เรื่อง  ${data.subject}`;
      const sw = this.measure(ctx, subj, 14);
      this.text(ctx, subj, (CW - sw) / 2, y, 14);
      y += px(20);
    }

    // Divider
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(CW / 2 - px(30), y);
    ctx.lineTo(CW / 2 + px(30), y);
    ctx.stroke();
    y += px(20);

    if (data.body) {
      y = this.drawBody(ctx, data.body, ML + INDENT, y, 14, CONTENT_W - INDENT);
    }
    y += px(16);

    if (data.date) {
      const dateLabel = isOrder ? 'สั่ง' : 'ประกาศ';
      const dateText = `${dateLabel} ณ วันที่  ${data.date}`;
      this.text(ctx, dateText, CW / 2 + px(20), y, 14);
      y += px(50);
    }

    if (data.signerName) {
      const label = `(${data.signerName})`;
      const lw = this.measure(ctx, label, 14);
      this.text(ctx, label, CW / 2 + px(80) - lw / 2, y, 14);
      y += px(18);
    }
    if (data.signerPosition) {
      const pw = this.measure(ctx, data.signerPosition, 14);
      this.text(ctx, data.signerPosition, CW / 2 + px(80) - pw / 2, y, 14);
    }

    return this.toPdf(canvas);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

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

  /**
   * Draws a single line of text, wrapping at maxWidth.
   * Returns the new y position after the last line.
   */
  private drawWrapped(
    ctx: any,
    str: string,
    x: number,
    y: number,
    size: number,
    maxWidth: number,
  ): number {
    const lines = this.wrap(ctx, str, size, maxWidth);
    for (const line of lines) {
      this.text(ctx, line, x, y, size);
      y += px(22);
    }
    return y;
  }

  /**
   * Draws multi-paragraph body text with indent.
   * Returns the new y position.
   */
  private drawBody(
    ctx: any,
    body: string,
    x: number,
    y: number,
    size: number,
    maxWidth: number,
  ): number {
    const normalized = body.replace(/\n{3,}/g, '\n\n').trim();
    let firstInPara = true;

    for (const para of normalized.split('\n')) {
      if (!para.trim()) {
        y += px(10); // paragraph gap
        firstInPara = true;
        continue;
      }
      const lines = this.wrap(ctx, para, size, maxWidth);
      for (let i = 0; i < lines.length; i++) {
        if (y + px(size) > CH - MT) break; // page overflow guard
        // Indent only the first line of each paragraph
        const lineX = firstInPara && i === 0 ? x : x - INDENT + INDENT; // keep same x
        this.text(ctx, lines[i], lineX, y, size);
        y += px(22);
      }
      firstInPara = false;
    }
    return y;
  }

  /** Word-wrap + character-fallback for Thai (no space boundaries). */
  private wrap(ctx: any, text: string, size: number, maxWidth: number): string[] {
    ctx.font = this.font(size, false);
    const lines: string[] = [];
    const tokens = text.split(/\s+/);
    let current = '';

    for (const token of tokens) {
      if (!token) continue;
      const test = current ? `${current} ${token}` : token;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else if (current) {
        lines.push(current);
        current = token;
      } else {
        // Single token wider than maxWidth — break by character
        for (const ch of token) {
          const testCh = current + ch;
          if (ctx.measureText(testCh).width > maxWidth && current) {
            lines.push(current);
            current = ch;
          } else {
            current = testCh;
          }
        }
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /** Convert canvas to a single-page PDF (image-embedded). */
  private async toPdf(canvas: Canvas): Promise<Buffer> {
    const png = await canvas.encode('png');
    const doc = await PDFDocument.create();
    const page = doc.addPage([A4_PT_W, A4_PT_H]);
    const img = await doc.embedPng(png);
    page.drawImage(img, { x: 0, y: 0, width: A4_PT_W, height: A4_PT_H });
    return Buffer.from(await doc.save());
  }
}
