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

  async applyAllStamps(pdfBuffer: Buffer, data: AllStampsData): Promise<Buffer> {
    const specs = [
      { w: 160, h: 70,  preference: 'top-right' as const },
      { w: 260, h: 150, preference: 'top-left'  as const },
      ...(data.directorNote
        ? [{ w: 260, h: 120, preference: 'top-left' as const }]
        : []),
    ];

    const zones = await this.emptySpace.findStampZones(pdfBuffer, specs);

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    pdfDoc.registerFontkit(fontkit);
    const { regular, bold } = await this.loadFonts(pdfDoc);

    const page = pdfDoc.getPages()[0];
    const { height: pageH } = page.getSize();

    // Stamp 1: x from algorithm (horizontal correct), y locked 8px from top of page
    if (zones[0]) {
      zones[0] = { ...zones[0], y: pageH - zones[0].h - 8 };
    }

    // Draw in order 1 → 2 → 3 (top to bottom)
    this.drawRegistrationStamp(page, regular, bold, data.registration, zones[0]);
    this.drawEndorsementStamp(page, regular, bold, data.endorsement, zones[1]);
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
    const blue = rgb(0.07, 0.33, 0.71);

    this.drawRoundedRect(page, x, y, w, h, 4, rgb(1, 1, 1), blue, 1.5);

    // Org name — centered
    const orgSize = 8;
    const orgName = this.wrapToFit(data.orgName, bold, orgSize, w - 16, 1)[0] ?? '';
    const orgW = bold.widthOfTextAtSize(orgName.normalize('NFC'), orgSize);
    this.drawThaiText(page, orgName, x + (w - orgW) / 2, y + h - 16, orgSize, bold, blue);

    page.drawLine({
      start: { x: x + 5, y: y + h - 22 },
      end:   { x: x + w - 5, y: y + h - 22 },
      thickness: 0.5, color: blue,
    });

    // เลขที่รับ
    this.drawThaiText(page, 'เลขที่รับ', x + 8, y + h - 36, 8, bold, blue);
    this.drawThaiText(page, data.registrationNo, x + 65, y + h - 36, 10, regular, blue);

    // วันที่
    this.drawThaiText(page, 'วันที่', x + 8, y + h - 50, 9, bold, blue);
    this.drawThaiText(page, `${d.day} ${d.monthTh} ${d.year}`, x + 45, y + h - 50, 9, regular, blue);

    // เวลา
    this.drawThaiText(page, 'เวลา', x + 8, y + h - 64, 9, bold, blue);
    this.drawThaiText(page, d.time, x + 45, y + h - 64, 9, regular, blue);
  }

  // ─── Stamp #2: ตราการเกษียณหนังสือ ────────────────────────────────────────

  private drawEndorsementStamp(
    page: any, regular: any, bold: any,
    data: EndorsementStampData, zone: StampZone,
  ) {
    const { x, y, w, h } = zone;
    const inner = w - 16;
    const d = this.toThaiDate(data.stampedAt);
    const blue = rgb(0.07, 0.33, 0.71);

    this.drawRoundedRect(page, x, y, w, h, 4, rgb(1, 1, 1), blue, 1.5);

    // Row 1: เรียน ผู้อำนวยการโรงเรียน {schoolName}
    const salutation = this.wrapToFit(
      `เรียน ผู้อำนวยการโรงเรียน ${data.schoolName}`, bold, 8, inner, 1,
    )[0] ?? '';
    this.drawThaiText(page, salutation, x + 8, y + h - 14, 8, bold, blue);

    page.drawLine({
      start: { x: x + 5, y: y + h - 22 },
      end:   { x: x + w - 5, y: y + h - 22 },
      thickness: 0.5, color: blue,
    });

    // Row 2: AI summary (max 2 lines)
    const summaryLines = this.wrapToFit(data.aiSummary, regular, 8, inner, 2);
    let ty = y + h - 33;
    for (const line of summaryLines) {
      this.drawThaiText(page, line, x + 8, ty, 8, regular, blue);
      ty -= 11;
    }

    // Row 3: สิ่งที่ต้องดำเนินการ
    const actionLabelY = y + h - 33 - (summaryLines.length || 1) * 11 - 6;
    this.drawThaiText(page, 'สิ่งที่ต้องดำเนินการ :', x + 8, actionLabelY, 8, bold, blue);

    const actionLines = this.wrapToFit(data.actionSummary, regular, 8, inner, 2);
    let ay = actionLabelY - 11;
    for (const line of actionLines) {
      this.drawThaiText(page, line, x + 8, ay, 8, regular, blue);
      ay -= 11;
    }

    // Signature block (fixed from bottom)
    const dateStr = `${d.day} ${d.monthTh.slice(0, 3)}. ${d.year}`;
    this.drawRight(page, bold,    data.authorName,   x, y + 42, w - 8, 9, blue);
    if (data.positionTitle) this.drawRight(page, regular, data.positionTitle, x, y + 28, w - 8, 8, blue);
    this.drawRight(page, regular, dateStr,           x, y + 14, w - 8, 8, blue);
  }

  // ─── Stamp #3: ตราคำสั่งผู้บริหาร ─────────────────────────────────────────

  private drawDirectorNoteStamp(
    page: any, regular: any, bold: any,
    data: DirectorNoteStampData, zone: StampZone,
  ) {
    const { x, y, w, h } = zone;
    const d = this.toThaiDate(data.stampedAt);
    const blue = rgb(0.07, 0.33, 0.71);

    this.drawRoundedRect(page, x, y, w, h, 4, rgb(1, 1, 1), blue, 1.5);

    // Header "คำสั่ง" centered with underline
    const header = 'คำสั่ง';
    const hSize = 9;
    const hW = bold.widthOfTextAtSize(header.normalize('NFC'), hSize);
    const hx = x + (w - hW) / 2;
    const hy = y + h - 16;
    this.drawThaiText(page, header, hx, hy, hSize, bold, blue);
    page.drawLine({ start: { x: hx, y: hy - 1 }, end: { x: hx + hW, y: hy - 1 }, thickness: 0.5, color: blue });

    page.drawLine({ start: { x: x + 5, y: y + h - 24 }, end: { x: x + w - 5, y: y + h - 24 }, thickness: 0.5, color: blue });

    // Note text (max 3 lines to avoid overlapping signature)
    const lines = this.wrapToFit(data.noteText, regular, 9, w - 16, 3);
    let ty = y + h - 38;
    for (const line of lines) {
      this.drawThaiText(page, line, x + 8, ty, 9, regular, blue);
      ty -= 14;
    }

    // Signature block
    const dateStr = `${d.day} ${d.monthTh.slice(0, 3)}. ${d.year}`;
    this.drawRight(page, bold,    data.authorName,   x, y + 42, w - 8, 9, blue);
    if (data.positionTitle) this.drawRight(page, regular, data.positionTitle, x, y + 28, w - 8, 8, blue);
    this.drawRight(page, regular, dateStr,           x, y + 14, w - 8, 8, blue);
  }

  // ─── Rounded rectangle ────────────────────────────────────────────────────

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
      y: y + h,
      color: fillColor,
      borderColor,
      borderWidth,
    });
  }

  // ─── Thai-aware text rendering ────────────────────────────────────────────

  /**
   * Returns true for Thai combining marks (above/below vowels, tone marks)
   * that should render on top of the preceding base character with zero advance.
   */
  private isThaiMark(cp: number): boolean {
    return (
      cp === 0x0E31 ||                    // ั  sara a (above)
      (cp >= 0x0E34 && cp <= 0x0E37) ||  // ิ ี ึ ื
      (cp >= 0x0E38 && cp <= 0x0E3A) ||  // ุ ู ฺ
      cp === 0x0E47 ||                    // ็  maitaikhu
      (cp >= 0x0E48 && cp <= 0x0E4E)     // ่ ้ ๊ ๋ ์ ํ ๎
    );
  }

  /**
   * Compute the visual advance width of a Thai string, treating combining
   * marks as zero-width (they overlay the base consonant).
   */
  private thaiTextWidth(text: string, font: any, size: number): number {
    let w = 0;
    for (const char of text) {
      if (!this.isThaiMark(char.codePointAt(0)!)) {
        w += font.widthOfTextAtSize(char, size);
      }
    }
    return w;
  }

  /**
   * Render Thai text as a single string — fontkit's GSUB/GPOS handles all
   * mark positioning (สระ/วรรณยุกต์) internally, eliminating the กระโดด gap.
   */
  private drawThaiText(
    page: any, text: string,
    x: number, y: number,
    size: number, font: any, color: any,
  ) {
    if (!text) return;
    page.drawText(text.normalize('NFC'), { x, y, size, font, color });
  }

  /** Merge any segment that starts with a Thai combining mark into the previous segment. */
  private mergeMarkSegments(segments: string[]): string[] {
    const merged: string[] = [];
    for (const seg of segments) {
      const firstCp = seg.codePointAt(0);
      if (merged.length > 0 && firstCp !== undefined && this.isThaiMark(firstCp)) {
        merged[merged.length - 1] += seg;
      } else {
        merged.push(seg);
      }
    }
    return merged;
  }

  /** Right-align Thai text within a box */
  private drawRight(
    page: any, font: any, text: string,
    boxX: number, y: number, maxW: number, size: number,
    color = rgb(0, 0, 0),
  ) {
    const t = text.normalize('NFC');
    const textW = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: boxX + maxW - textW, y, size, font, color });
  }

  // ─── Thai-aware word wrap ─────────────────────────────────────────────────

  /**
   * Pixel-accurate word wrap using wordcut for Thai segmentation.
   * Line widths are measured with thaiTextWidth (marks are zero-width).
   * The last line is truncated with … if it still overflows.
   */
  private wrapToFit(
    text: string,
    font: any,
    size: number,
    maxWidthPt: number,
    maxLines: number,
  ): string[] {
    if (!text?.trim()) return [];

    if (!this.wordcutReady) {
      wordcut.init();
      this.wordcutReady = true;
    }

    let segments: string[];
    try {
      const cut: string = wordcut.cut(text.normalize('NFC'));
      segments = cut.split('|').filter((s: string) => s.length > 0);
    } catch {
      segments = text.includes(' ')
        ? text.split(' ').flatMap((w, i, arr) => i < arr.length - 1 ? [w, ' '] : [w])
        : Array.from(text);
    }

    // Merge orphan mark segments before wrapping
    const merged = this.mergeMarkSegments(segments);

    const lines: string[] = [];
    let cur = '';

    for (const seg of merged) {
      const test = cur + seg;
      if (this.thaiTextWidth(test, font, size) > maxWidthPt && cur !== '') {
        lines.push(cur);
        if (lines.length >= maxLines) { cur = ''; break; }
        cur = seg;
      } else {
        cur = test;
      }
    }
    if (cur && lines.length < maxLines) lines.push(cur);

    // Truncate any line that still overflows (e.g. a very long unbreakable word)
    return lines.map((line) => {
      if (this.thaiTextWidth(line, font, size) <= maxWidthPt) return line;
      let t = line;
      while (t.length > 0 && this.thaiTextWidth(t + '…', font, size) > maxWidthPt) {
        t = t.slice(0, -1);
      }
      return t + '…';
    });
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

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
}
