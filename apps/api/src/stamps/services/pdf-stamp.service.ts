import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';
import { EmptySpaceService, StampZone } from './empty-space.service';

// ─── Data interfaces ─────────────────────────────────────────────────────────

export interface RegistrationStampData {
  orgName: string;
  registrationNo: string;
  registeredAt: Date;
}

export interface EndorsementStampData {
  endorsementText: string;
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

  constructor(private readonly emptySpace: EmptySpaceService) {}

  // ─── Public: apply all 3 stamps in a single pass ──────────────────────────

  /**
   * Find empty zones and apply all stamps in one pass.
   * Stamp #3 (director note) is optional — omit if no directorNote provided.
   */
  async applyAllStamps(pdfBuffer: Buffer, data: AllStampsData): Promise<Buffer> {
    const specs = [
      { w: 160, h: 70,  preference: 'top-right'   as const }, // stamp1: w-40, h-25
      { w: 260, h: 110, preference: 'bottom-left'  as const },
      ...(data.directorNote
        ? [{ w: 260, h: 120, preference: 'bottom-right' as const }]
        : []),
    ];

    const zones = await this.emptySpace.findStampZones(pdfBuffer, specs);

    // Stamp 1: shift right +20, up +10 after zone is found
    if (zones[0]) {
      zones[0] = { ...zones[0], x: zones[0].x + 20, y: zones[0].y + 10 };
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
    page.drawRectangle({
      x, y, width: w, height: h,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.07, 0.33, 0.71),
      borderWidth: 1.5,
    });

    // Org name — centered, truncate if too long
    const orgName = data.orgName.length > 30 ? data.orgName.slice(0, 28) + '..' : data.orgName;
    const orgSize = 8;
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
    const d = this.toThaiDate(data.stampedAt);

    const blue = rgb(0.07, 0.33, 0.71);

    // Dashed blue box
    page.drawRectangle({
      x, y, width: w, height: h,
      color: rgb(1, 1, 1),
      borderColor: blue,
      borderWidth: 1.5,
      borderDashArray: [4, 3],
    });

    // Endorsement text (word-wrapped, max 4 lines)
    const lines = this.wrapThai(data.endorsementText, 38);
    let ty = y + h - 18;
    for (const line of lines.slice(0, 4)) {
      page.drawText(line, { x: x + 8, y: ty, size: 10, font: regular, color: blue });
      ty -= 16;
    }

    // Right-aligned signature block
    const dateStr = `${d.day} ${d.monthTh.slice(0, 3)}. ${d.year}`;
    this.drawRight(page, bold,    data.authorName,               x, y + 42, w - 8, 9, blue);
    if (data.positionTitle) this.drawRight(page, regular, data.positionTitle, x, y + 28, w - 8, 8, blue);
    this.drawRight(page, regular, dateStr,                       x, y + 14, w - 8, 8, blue);
  }

  // ─── Stamp #3: ตราคำสั่งผู้บริหาร ─────────────────────────────────────────

  private drawDirectorNoteStamp(
    page: any, regular: any, bold: any,
    data: DirectorNoteStampData, zone: StampZone,
  ) {
    const { x, y, w, h } = zone;
    const d = this.toThaiDate(data.stampedAt);

    const blue = rgb(0.07, 0.33, 0.71);

    // Blue box
    page.drawRectangle({
      x, y, width: w, height: h,
      color: rgb(1, 1, 1),
      borderColor: blue,
      borderWidth: 1.5,
    });

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

    // Note text (word-wrapped)
    const lines = this.wrapThai(data.noteText, 38);
    let ty = y + h - 38;
    for (const line of lines.slice(0, 4)) {
      page.drawText(line, { x: x + 8, y: ty, size: 10, font: regular, color: blue });
      ty -= 16;
    }

    // Right-aligned signature block
    const dateStr = `${d.day} ${d.monthTh.slice(0, 3)}. ${d.year}`;
    this.drawRight(page, bold,    data.authorName,               x, y + 42, w - 8, 9, blue);
    if (data.positionTitle) this.drawRight(page, regular, data.positionTitle, x, y + 28, w - 8, 8, blue);
    this.drawRight(page, regular, dateStr,                       x, y + 14, w - 8, 8, blue);
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

  /** Naïve word-wrap for Thai text (splits on spaces; Thai words have no spaces,
   *  so we fall back to character-count chunking when no space exists). */
  private wrapThai(text: string, maxChars: number): string[] {
    // If text has spaces (mixed Thai+space or English), split by space
    if (text.includes(' ')) {
      const words = text.split(' ');
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        if ((cur + (cur ? ' ' : '') + w).length > maxChars) {
          if (cur) lines.push(cur);
          cur = w;
        } else {
          cur = cur ? `${cur} ${w}` : w;
        }
      }
      if (cur) lines.push(cur);
      return lines;
    }
    // Thai text: chunk by character count
    const lines: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) {
      lines.push(text.slice(i, i + maxChars));
    }
    return lines;
  }
}
