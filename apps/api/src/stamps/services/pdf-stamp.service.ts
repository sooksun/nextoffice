import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';
import * as wordcut from 'wordcut';
import { EmptySpaceService, StampZone } from './empty-space.service';

// ─── Data interfaces ─────────────────────────────────────────────────────────

export interface RegistrationStampData {
  orgName: string;
  registrationNo: string;
  registeredAt: Date;
}

export interface EndorsementStampData {
  schoolName: string;    // ชื่อโรงเรียน → "เรียน ผู้อำนวยการโรงเรียน {schoolName}"
  aiSummary: string;     // สรุปโดย AI จาก DocumentAiResult.summaryText
  actionSummary: string; // สิ่งที่ต้องดำเนินการ จาก nextActionJson
  authorName: string;
  positionTitle?: string;
  stampedAt: Date;
}

export interface DirectorNoteStampData {
  noteText: string;
  authorName: string;
  positionTitle?: string;
  stampedAt: Date;
}

export interface AllStampsData {
  registration: RegistrationStampData;
  endorsement: EndorsementStampData;
  directorNote?: DirectorNoteStampData;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class PdfStampService {
  private readonly logger = new Logger(PdfStampService.name);
  private wordcutReady = false;

  constructor(private readonly emptySpace: EmptySpaceService) {}

  // ─── Public: apply all 3 stamps in a single pass ──────────────────────────

  /**
   * Find empty zones and apply all stamps in one pass.
   * Stamp #3 (director note) is optional — omit if no directorNote provided.
   */
  async applyAllStamps(pdfBuffer: Buffer, data: AllStampsData): Promise<Buffer> {
    const specs = [
      { w: 160, h: 70,  preference: 'top-right'   as const }, // stamp1: w-40, h-25
      { w: 260, h: 150, preference: 'bottom-left'  as const },
      ...(data.directorNote
        ? [{ w: 260, h: 120, preference: 'bottom-right' as const }]
        : []),
    ];

    const zones = await this.emptySpace.findStampZones(pdfBuffer, specs);

    // Stamp 1: shift right +20, up +10 after zone is found
    if (zones[0]) {
      zones[0] = { ...zones[0], x: zones[0].x + 10, y: zones[0].y + 10 };
    }

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    pdfDoc.registerFontkit(fontkit);
    const { regular, bold } = await this.loadFonts(pdfDoc);

    const page = pdfDoc.getPages()[0];

    // Stamp 1 — registration (top-right)
    this.drawRegistrationStamp(page, regular, bold, data.registration, zones[0]);

    // Stamp 2 — endorsement (bottom-left)
    this.drawEndorsementStamp(page, regular, bold, data.endorsement, zones[1]);

    // Stamp 3 — director note (bottom-right, optional)
    if (data.directorNote && zones[2]) {
      this.drawDirectorNoteStamp(page, regular, bold, data.directorNote, zones[2]);
    }

    return Buffer.from(await pdfDoc.save());
  }

  // ─── Font loading ─────────────────────────────────────────────────────────

  private async loadFonts(pdfDoc: PDFDocument): Promise<{ regular: any; bold: any }> {
    try {
      const regularBytes = fs.readFileSync(path.join(__dirname, '..', 'fonts', 'Sarabun-Regular.ttf'));
      const boldBytes    = fs.readFileSync(path.join(__dirname, '..', 'fonts', 'Sarabun-Bold.ttf'));
      const regular = await pdfDoc.embedFont(regularBytes);
      const bold    = await pdfDoc.embedFont(boldBytes);
      return { regular, bold };
    } catch (e) {
      this.logger.warn(`Thai font not found, using Helvetica: ${e.message}`);
      const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      return { regular, bold };
    }
  }

  // ─── Stamp #1: ตราลงทะเบียนรับ ────────────────────────────────────────────

  private drawRegistrationStamp(
    page: any, regular: any, bold: any,
    data: RegistrationStampData, zone: StampZone,
  ) {
    const { x, y, w, h } = zone;
    const d = this.toThaiDate(data.registeredAt);

    // Box
    this.drawRoundedRect(page, x, y, w, h, 20, rgb(1, 1, 1), rgb(0.07, 0.33, 0.71), 1.5);

    // Org name — centered, pixel-accurate truncation
    const orgSize = 8;
    const orgName = (this.wrapToFit(data.orgName, bold, orgSize, w - 16, 1)[0]) ?? '';
    const orgW = bold.widthOfTextAtSize(orgName, orgSize);
    page.drawText(orgName, {
      x: x + (w - orgW) / 2,
      y: y + h - 16,
      size: orgSize, font: bold, color: rgb(0.07, 0.33, 0.71),
    });

    // Divider
    page.drawLine({
      start: { x: x + 5, y: y + h - 22 },
      end:   { x: x + w - 5, y: y + h - 22 },
      thickness: 0.5, color: rgb(0.07, 0.33, 0.71),
    });

    const blue = rgb(0.07, 0.33, 0.71);

    // เลขที่รับ
    page.drawText('เลขที่รับ', { x: x + 8, y: y + h - 36, size: 8, font: bold,    color: blue });
    page.drawText(data.registrationNo, { x: x + 65, y: y + h - 36, size: 10, font: regular, color: blue });

    // วันที่
    page.drawText('วันที่',   { x: x + 8, y: y + h - 54, size: 9, font: bold,    color: blue });
    page.drawText(`${d.day} ${d.monthTh} ${d.year}`, { x: x + 45, y: y + h - 54, size: 9, font: regular, color: blue });

    // เวลา
    page.drawText('เวลา',    { x: x + 8, y: y + h - 72, size: 9, font: bold,    color: blue });
    page.drawText(d.time,    { x: x + 45, y: y + h - 72, size: 9, font: regular, color: blue });
  }

  // ─── Stamp #2: ตราการเกษียณหนังสือ ────────────────────────────────────────

  private drawEndorsementStamp(
    page: any, regular: any, bold: any,
    data: EndorsementStampData, zone: StampZone,
  ) {
    const { x, y, w, h } = zone;
    const inner = w - 16; // usable content width (8px padding each side)
    const d = this.toThaiDate(data.stampedAt);
    const blue = rgb(0.07, 0.33, 0.71);

    // Box (solid, rounded)
    this.drawRoundedRect(page, x, y, w, h, 20, rgb(1, 1, 1), blue, 1.5);

    // ── Row 1: เรียน ผู้อำนวยการโรงเรียน {schoolName} ──
    const salutationLines = this.wrapToFit(
      `เรียน ผู้อำนวยการโรงเรียน ${data.schoolName}`, bold, 8, inner, 1,
    );
    page.drawText(salutationLines[0] ?? '', { x: x + 8, y: y + h - 14, size: 8, font: bold, color: blue });

    // Divider
    page.drawLine({
      start: { x: x + 5, y: y + h - 22 },
      end:   { x: x + w - 5, y: y + h - 22 },
      thickness: 0.5, color: blue,
    });

    // ── Row 2: AI summary (max 2 lines, 8pt regular) ──
    const summaryLines = this.wrapToFit(data.aiSummary, regular, 8, inner, 2);
    let ty = y + h - 33;
    for (const line of summaryLines) {
      page.drawText(line, { x: x + 8, y: ty, size: 8, font: regular, color: blue });
      ty -= 11;
    }

    // ── Row 3: สิ่งที่ต้องดำเนินการ (label + content, max 2 lines) ──
    const actionLabelY = y + h - 33 - (summaryLines.length || 1) * 11 - 6;
    page.drawText('สิ่งที่ต้องดำเนินการ :', { x: x + 8, y: actionLabelY, size: 8, font: bold, color: blue });

    const actionLines = this.wrapToFit(data.actionSummary, regular, 8, inner, 2);
    let ay = actionLabelY - 11;
    for (const line of actionLines) {
      page.drawText(line, { x: x + 8, y: ay, size: 8, font: regular, color: blue });
      ay -= 11;
    }

    // ── Signature block (fixed positions from bottom) ──
    const dateStr = `${d.day} ${d.monthTh.slice(0, 3)}. ${d.year}`;
    this.drawRight(page, bold,    data.authorName,  x, y + 42, w - 8, 9, blue);
    if (data.positionTitle) this.drawRight(page, regular, data.positionTitle, x, y + 28, w - 8, 8, blue);
    this.drawRight(page, regular, dateStr,          x, y + 14, w - 8, 8, blue);
  }

  // ─── Stamp #3: ตราคำสั่งผู้บริหาร ─────────────────────────────────────────

  private drawDirectorNoteStamp(
    page: any, regular: any, bold: any,
    data: DirectorNoteStampData, zone: StampZone,
  ) {
    const { x, y, w, h } = zone;
    const d = this.toThaiDate(data.stampedAt);

    const blue = rgb(0.07, 0.33, 0.71);

    // Blue box (solid, rounded)
    this.drawRoundedRect(page, x, y, w, h, 20, rgb(1, 1, 1), blue, 1.5);

    // Header "คำสั่ง" centered with underline
    const header = 'คำสั่ง';
    const hSize = 9;
    const hW = bold.widthOfTextAtSize(header, hSize);
    const hx = x + (w - hW) / 2;
    const hy = y + h - 16;
    page.drawText(header, { x: hx, y: hy, size: hSize, font: bold, color: blue });
    page.drawLine({ start: { x: hx, y: hy - 1 }, end: { x: hx + hW, y: hy - 1 }, thickness: 0.5, color: blue });

    // Divider below header
    page.drawLine({ start: { x: x + 5, y: y + h - 24 }, end: { x: x + w - 5, y: y + h - 24 }, thickness: 0.5, color: blue });

    // Note text — pixel-accurate wrap, max 3 lines to avoid signature overlap
    const lines = this.wrapToFit(data.noteText, regular, 9, w - 16, 3);
    let ty = y + h - 38;
    for (const line of lines) {
      page.drawText(line, { x: x + 8, y: ty, size: 9, font: regular, color: blue });
      ty -= 14;
    }

    // Right-aligned signature block
    const dateStr = `${d.day} ${d.monthTh.slice(0, 3)}. ${d.year}`;
    this.drawRight(page, bold,    data.authorName,               x, y + 42, w - 8, 9, blue);
    if (data.positionTitle) this.drawRight(page, regular, data.positionTitle, x, y + 28, w - 8, 8, blue);
    this.drawRight(page, regular, dateStr,                       x, y + 14, w - 8, 8, blue);
  }

  // ─── Rounded rectangle ───────────────────────────────────────────────────

  /** Draw a filled rounded rectangle using SVG path (pdf-lib drawRectangle has no radius support) */
  private drawRoundedRect(
    page: any,
    x: number, y: number,
    w: number, h: number,
    r: number,
    fillColor: any,
    borderColor: any,
    borderWidth: number,
  ) {
    const cr = Math.min(r, w / 2, h / 2);
    const path = [
      `M ${cr},0`,
      `L ${w - cr},0`,
      `Q ${w},0 ${w},${cr}`,
      `L ${w},${h - cr}`,
      `Q ${w},${h} ${w - cr},${h}`,
      `L ${cr},${h}`,
      `Q 0,${h} 0,${h - cr}`,
      `L 0,${cr}`,
      `Q 0,0 ${cr},0`,
      'Z',
    ].join(' ');
    page.drawSvgPath(path, {
      x,
      y: y + h, // SVG origin = top-left → maps to PDF y = bottom + height
      color: fillColor,
      borderColor,
      borderWidth,
    });
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  /** Right-align text within the stamp box */
  private drawRight(
    page: any, font: any, text: string,
    boxX: number, y: number, maxW: number, size: number,
    color = rgb(0, 0, 0),
  ) {
    const textW = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: boxX + maxW - textW, y, size, font, color });
  }

  /** Convert JS Date to Thai Buddhist Era date parts */
  private toThaiDate(date: Date) {
    const months = [
      'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
      'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
    ];
    return {
      day:     date.getDate(),
      monthTh: months[date.getMonth()],
      year:    date.getFullYear() + 543,
      time:    `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')} น.`,
    };
  }

  /**
   * Pixel-accurate word wrap with Thai word segmentation via wordcut.
   * @param text     input text (Thai, English, or mixed)
   * @param font     embedded pdf-lib font (provides widthOfTextAtSize)
   * @param size     font size in points
   * @param maxWidthPt  max line width in PDF points
   * @param maxLines maximum number of output lines (last line truncated with … if needed)
   */
  private wrapToFit(
    text: string,
    font: any,
    size: number,
    maxWidthPt: number,
    maxLines: number,
  ): string[] {
    if (!text?.trim()) return [];

    // Lazy-init wordcut (idempotent after first call)
    if (!this.wordcutReady) {
      wordcut.init();
      this.wordcutReady = true;
    }

    // Segment Thai text into words; keep space tokens so mixed text stays readable
    let segments: string[];
    try {
      const cut: string = wordcut.cut(text);
      segments = cut.split('|').filter((s: string) => s.length > 0);
    } catch {
      // Fallback: split by space for English, or char-by-char for Thai
      segments = text.includes(' ')
        ? text.split(' ').flatMap((w, i, arr) => i < arr.length - 1 ? [w, ' '] : [w])
        : Array.from(text);
    }

    const lines: string[] = [];
    let cur = '';

    for (const seg of segments) {
      const test = cur + seg;
      if (font.widthOfTextAtSize(test, size) > maxWidthPt && cur !== '') {
        lines.push(cur);
        if (lines.length >= maxLines) { cur = ''; break; }
        cur = seg;
      } else {
        cur = test;
      }
    }
    if (cur && lines.length < maxLines) lines.push(cur);

    // Ensure every line fits; truncate last character + append … until it does
    return lines.map((line) => {
      if (font.widthOfTextAtSize(line, size) <= maxWidthPt) return line;
      let t = line;
      while (t.length > 0 && font.widthOfTextAtSize(t + '…', size) > maxWidthPt) {
        t = t.slice(0, -1);
      }
      return t + '…';
    });
  }
}
