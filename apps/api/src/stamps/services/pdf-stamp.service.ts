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
    // Load PDF and fonts first — needed to compute dynamic heights for stamps 2 & 3
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    pdfDoc.registerFontkit(fontkit);
    const { regular, bold } = await this.loadFonts(pdfDoc);

    const page = pdfDoc.getPages()[0];
    const { height: pageH } = page.getSize();

    // Compute auto-heights for stamps 2 & 3 based on actual content
    const w23 = 240;
    const h2 = this.computeEndorsementHeight(data.endorsement, regular, bold, w23);
    const h3 = data.directorNote
      ? this.computeDirectorNoteHeight(data.directorNote, regular, bold, w23)
      : 0;

    const specs = [
      { w: 160, h: 70,  preference: 'top-right'      as const }, // stamp 1: locked top-right
      { w: w23, h: h2,  preference: 'lower-half-ltr' as const }, // stamp 2: lower-half, L→R
      ...(data.directorNote
        ? [{ w: w23, h: h3, preference: 'lower-half-ltr' as const }] // stamp 3: next slot
        : []),
    ];

    const zones = await this.emptySpace.findStampZones(pdfBuffer, specs);

    // Stamp 1: x from algorithm, y locked 8pt from top of page
    if (zones[0]) {
      zones[0] = { ...zones[0], y: pageH - zones[0].h - 8 };
    }

    // Stamp 3: shift down 30pt to avoid overlap with document signatures
    if (zones[2]) {
      zones[2] = { ...zones[2], y: zones[2].y - 30 };
    }

    // Draw in order 1 → 2 → 3
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

  // ─── Height calculators ────────────────────────────────────────────────────

  /**
   * Compute the minimum height needed for stamp #2 (endorsement).
   * Layout (top → bottom):
   *   14pt  salutation
   *    8pt  → separator at h-22
   *   11pt  → gap to first summary line
   *   nSummary × 11pt  summary lines
   *    6pt  gap
   *   11pt  action label
   *   nAction × 11pt  action lines
   *   ??pt  gap
   *   42pt  signature block (author + position + date)
   *   14pt  bottom padding
   */
  private computeEndorsementHeight(
    data: EndorsementStampData, regular: any, bold: any, w: number,
  ): number {
    const inner = w - 16;
    const nSummary = Math.max(this.wrapToFit(data.aiSummary, regular, 8, inner, 4).length, 1);
    const nAction  = Math.max(this.wrapToFit(data.actionSummary, regular, 8, inner, 4).length, 0);
    // 89 = 14+8+11 (top) + 6+11 (action label gap) + 8 (content-sig gap) + 42+14 (sig+bottom)
    return Math.max(89 + (nSummary + nAction) * 11 + 12, 90);
  }

  /**
   * Compute the minimum height needed for stamp #3 (director note).
   * Layout (top → bottom):
   *   16pt  header "คำสั่ง"
   *    8pt  → separator at h-24
   *   14pt  → gap to first note line
   *   nLines × 14pt  note lines
   *   ??pt  gap
   *   42pt  signature block
   *   14pt  bottom padding
   */
  private computeDirectorNoteHeight(
    data: DirectorNoteStampData, regular: any, bold: any, w: number,
  ): number {
    const nLines = Math.max(this.wrapToFit(data.noteText, regular, 9, w - 16, 3).length, 1);
    // 88 = 16+8+14 (top) + 8 (content-sig gap) + 42+14 (sig+bottom)   minus 14 for nLines start
    return Math.max(88 + nLines * 14, 90);
  }

  // ─── Stamp #1: ตราลงทะเบียนรับ ────────────────────────────────────────────

  private drawRegistrationStamp(
    page: any, regular: any, bold: any,
    data: RegistrationStampData, zone: StampZone,
  ) {
    const { x, y, w, h } = zone;
    const d = this.toThaiDate(data.registeredAt);
    const blue = rgb(0.07, 0.33, 0.71);

    // Stamp 1 keeps its border box
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

  // ─── Stamp #2: ตราการเกษียณหนังสือ (no border, transparent bg) ────────────

  private drawEndorsementStamp(
    page: any, regular: any, bold: any,
    data: EndorsementStampData, zone: StampZone,
  ) {
    const { x, y, w, h } = zone;
    const inner = w - 16;
    const d = this.toThaiDate(data.stampedAt);
    const blue = rgb(0.07, 0.33, 0.71);

    // No border box — transparent background

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

    // Row 2: AI summary (max 4 lines)
    const summaryLines = this.wrapToFit(data.aiSummary, regular, 8, inner, 4);
    let ty = y + h - 33;
    for (const line of summaryLines) {
      this.drawThaiText(page, line, x + 8, ty, 8, regular, blue);
      ty -= 11;
    }

    // Row 3: สิ่งที่ต้องดำเนินการ
    const actionLabelY = y + h - 33 - (summaryLines.length || 1) * 11 - 6;
    this.drawThaiText(page, 'สิ่งที่ต้องดำเนินการ :', x + 8, actionLabelY, 8, bold, blue);

    const actionLines = this.wrapToFit(data.actionSummary, regular, 8, inner, 4);
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

  // ─── Stamp #3: ตราคำสั่งผู้บริหาร (no border, transparent bg) ──────────────

  private drawDirectorNoteStamp(
    page: any, regular: any, bold: any,
    data: DirectorNoteStampData, zone: StampZone,
  ) {
    const { x, y, w, h } = zone;
    const d = this.toThaiDate(data.stampedAt);
    const blue = rgb(0.07, 0.33, 0.71);

    // No border box — transparent background

    // Header "คำสั่ง" left-aligned with underline
    const header = 'คำสั่ง';
    const hSize = 9;
    const hW = bold.widthOfTextAtSize(header.normalize('NFC'), hSize);
    const hx = x + 8;
    const hy = y + h - 16;
    this.drawThaiText(page, header, hx, hy, hSize, bold, blue);
    page.drawLine({ start: { x: hx, y: hy - 1 }, end: { x: hx + hW, y: hy - 1 }, thickness: 0.5, color: blue });

    page.drawLine({ start: { x: x + 5, y: y + h - 24 }, end: { x: x + w - 5, y: y + h - 24 }, thickness: 0.5, color: blue });

    // Note text (max 3 lines)
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

  // ─── Rounded rectangle (stamp #1 only) ───────────────────────────────────

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
    const svgPath = [
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
    page.drawSvgPath(svgPath, {
      x,
      y: y + h,
      color: fillColor,
      borderColor,
      borderWidth,
    });
  }

  // ─── Thai-aware text rendering ────────────────────────────────────────────

  private isThaiMark(cp: number): boolean {
    return (
      cp === 0x0E31 ||
      cp === 0x0E33 ||                        // sara am ำ
      (cp >= 0x0E34 && cp <= 0x0E37) ||
      (cp >= 0x0E38 && cp <= 0x0E3A) ||
      cp === 0x0E47 ||
      (cp >= 0x0E48 && cp <= 0x0E4E)
    );
  }

  private isThaiLeadingVowel(cp: number): boolean {
    return cp >= 0x0E40 && cp <= 0x0E44; // เ แ โ ใ ไ
  }

  private thaiTextWidth(text: string, font: any, size: number): number {
    if (!text) return 0;
    return font.widthOfTextAtSize(text.normalize('NFC'), size);
  }

  /**
   * Thai syllable cluster regex.
   * Matches: optional leading vowel (เแโใไ) + base consonant/vowel + optional combining marks.
   * The `|.` fallback captures spaces, punctuation, and non-Thai characters.
   */
  private readonly THAI_CLUSTER_RE =
    /[\u0E40-\u0E44]?[\u0E01-\u0E3F][\u0E31\u0E33-\u0E3A\u0E47-\u0E4E]*|./gsu;

  /**
   * Render Thai text cluster-by-cluster at explicit X positions.
   * Sarabun's GPOS adds extra advance when ั and ่ stack on the same consonant
   * (e.g. สั่), displacing the following ง visually. Drawing each cluster
   * separately eliminates cross-cluster GPOS, fixing the gap.
   */
  private drawThaiText(
    page: any, text: string,
    x: number, y: number,
    size: number, font: any, color: any,
  ) {
    if (!text) return;
    const nfc = this.toThaiNumerals(text).normalize('NFC');
    this.THAI_CLUSTER_RE.lastIndex = 0;
    const clusters = [...nfc.matchAll(this.THAI_CLUSTER_RE)].map((m) => m[0]);
    let curX = x;
    for (const cluster of clusters) {
      page.drawText(cluster, { x: curX, y, size, font, color });
      curX += font.widthOfTextAtSize(cluster, size);
    }
  }

  /**
   * Merge Thai combining mark segments and leading-vowel segments with their base consonant.
   * Pass 1: backward-merge trailing marks (ั ิ ่ ้ ็ ํ …) into the previous segment.
   * Pass 2: forward-merge isolated leading vowels (เ แ โ ใ ไ) into the next segment.
   */
  private mergeMarkSegments(segments: string[]): string[] {
    // Pass 1: backward-merge trailing marks
    const pass1: string[] = [];
    for (const seg of segments) {
      const firstCp = seg.codePointAt(0);
      if (pass1.length > 0 && firstCp !== undefined && this.isThaiMark(firstCp)) {
        pass1[pass1.length - 1] += seg;
      } else {
        pass1.push(seg);
      }
    }

    // Pass 2: forward-merge isolated leading vowels into the following segment
    const pass2: string[] = [];
    let i = 0;
    while (i < pass1.length) {
      const seg = pass1[i];
      const cp = seg.codePointAt(0);
      if (
        seg.length === 1 &&
        cp !== undefined &&
        this.isThaiLeadingVowel(cp) &&
        i + 1 < pass1.length
      ) {
        pass2.push(seg + pass1[i + 1]);
        i += 2;
      } else {
        pass2.push(seg);
        i++;
      }
    }
    return pass2;
  }

  /** Convert ASCII digits 0–9 to Thai numerals ๐–๙ */
  private toThaiNumerals(text: string): string {
    return text.replace(/[0-9]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'[+d]);
  }

  /** Right-align Thai text within a box */
  private drawRight(
    page: any, font: any, text: string,
    boxX: number, y: number, maxW: number, size: number,
    color = rgb(0, 0, 0),
  ) {
    const t = this.toThaiNumerals(text).normalize('NFC');
    const textW = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: boxX + maxW - textW, y, size, font, color });
  }

  // ─── Thai-aware word wrap ─────────────────────────────────────────────────

  private wrapToFit(
    text: string,
    font: any,
    size: number,
    maxWidthPt: number,
    maxLines: number,
  ): string[] {
    if (!text?.trim()) return [];

    const converted = this.toThaiNumerals(text);

    if (!this.wordcutReady) {
      wordcut.init();
      this.wordcutReady = true;
    }

    let segments: string[];
    try {
      const cut: string = wordcut.cut(converted.normalize('NFC'));
      segments = cut.split('|').filter((s: string) => s.length > 0);
    } catch {
      segments = converted.includes(' ')
        ? converted.split(' ').flatMap((w, i, arr) => i < arr.length - 1 ? [w, ' '] : [w])
        : Array.from(converted);
    }

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
