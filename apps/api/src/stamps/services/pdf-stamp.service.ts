import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';
import { EmptySpaceService } from './empty-space.service';
import { StampCanvasService, SIG_TOTAL } from './stamp-canvas.service';

// ─── Data interfaces ─────────────────────────────────────────────────────────

export interface RegistrationStampData {
  orgName: string;
  registrationNo: string;
  registeredAt: Date;
}

export interface EndorsementStampData {
  schoolName: string;
  aiSummary: string;
  actionSummary: string;
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

/** Fixed stamp width for stamps #2 and #3 */
const W23 = 220;

@Injectable()
export class PdfStampService {
  private readonly logger = new Logger(PdfStampService.name);

  constructor(
    private readonly emptySpace: EmptySpaceService,
    private readonly stampCanvas: StampCanvasService,
  ) {}

  // ─── Public: apply all 3 stamps ──────────────────────────────────────────

  async applyAllStamps(pdfBuffer: Buffer, data: AllStampsData): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    pdfDoc.registerFontkit(fontkit);

    const page = pdfDoc.getPages()[0];
    const { height: pageH } = page.getSize();

    // ── Compute content-box heights (canvas measurement, no rendering yet) ──
    const h2 = this.stampCanvas.computeEndorsementHeight(data.endorsement, W23);
    const h3 = data.directorNote
      ? this.stampCanvas.computeDirectorNoteHeight(data.directorNote, W23)
      : 0;

    // ── Find placement zones via pdfjs-dist text analysis ──
    const specs = [
      { w: 160, h: 70,  preference: 'top-right'       as const },
      { w: W23, h: h2,  preference: 'lower-half-left'  as const },
      ...(data.directorNote
        ? [{ w: W23, h: h3, preference: 'lower-half-right' as const }]
        : []),
    ];

    const zones = await this.emptySpace.findStampZones(pdfBuffer, specs);

    // Stamp 1: y locked 8pt from top
    if (zones[0]) zones[0] = { ...zones[0], y: pageH - zones[0].h - 8 };

    // ── Draw stamp #1 with pdf-lib (simple: org name + numbers only) ──
    const { regular, bold } = await this.loadFonts(pdfDoc);
    if (zones[0]) this.drawRegistrationStamp(page, regular, bold, data.registration, zones[0]);

    // ── Render stamps #2 and #3 as PNG via Skia canvas, then embed ──
    if (zones[1]) {
      const png2 = this.stampCanvas.renderEndorsement(data.endorsement, W23, h2);
      const img2 = await pdfDoc.embedPng(png2);
      // PNG includes signature area below box; position from (zone.y - SIG_TOTAL) upward
      page.drawImage(img2, {
        x:      zones[1].x,
        y:      zones[1].y - SIG_TOTAL,
        width:  W23,
        height: h2 + SIG_TOTAL,
      });
    }

    if (data.directorNote && zones[2]) {
      const png3 = this.stampCanvas.renderDirectorNote(data.directorNote, W23, h3);
      const img3 = await pdfDoc.embedPng(png3);
      page.drawImage(img3, {
        x:      zones[2].x,
        y:      zones[2].y - SIG_TOTAL,
        width:  W23,
        height: h3 + SIG_TOTAL,
      });
    }

    return Buffer.from(await pdfDoc.save());
  }

  // ─── Font loading (stamp #1 only) ────────────────────────────────────────

  private async loadFonts(pdfDoc: PDFDocument): Promise<{ regular: any; bold: any }> {
    try {
      const dir = path.join(__dirname, '..', 'fonts');
      const regular = await pdfDoc.embedFont(fs.readFileSync(path.join(dir, 'Sarabun-Regular.ttf')));
      const bold    = await pdfDoc.embedFont(fs.readFileSync(path.join(dir, 'Sarabun-Bold.ttf')));
      return { regular, bold };
    } catch {
      const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      return { regular, bold };
    }
  }

  // ─── Stamp #1: ตราลงทะเบียนรับ (pdf-lib — simple fixed text) ──────────────

  private drawRegistrationStamp(page: any, regular: any, bold: any, data: RegistrationStampData, zone: any) {
    const { x, y, w, h } = zone;
    const d = this.toThaiDate(data.registeredAt);
    const blue = rgb(0.07, 0.33, 0.71);

    this.drawRoundedRect(page, x, y, w, h, 4, rgb(1, 1, 1), blue, 1.5);

    // Org name — centered
    const orgSize = 8;
    const orgTxt = this.truncate(data.orgName, bold, orgSize, w - 16);
    const orgW = bold.widthOfTextAtSize(orgTxt, orgSize);
    page.drawText(orgTxt, { x: x + (w - orgW) / 2, y: y + h - 16, size: orgSize, font: bold, color: blue });

    page.drawLine({ start: { x: x+5, y: y+h-22 }, end: { x: x+w-5, y: y+h-22 }, thickness: 0.5, color: blue });

    // เลขที่รับ / วันที่ / เวลา  — ASCII digits + short Thai labels (safe with pdf-lib)
    page.drawText('เลขที่รับ', { x: x+8, y: y+h-36, size: 8, font: bold, color: blue });
    page.drawText(data.registrationNo, { x: x+65, y: y+h-36, size: 10, font: regular, color: blue });

    page.drawText('วันที่', { x: x+8, y: y+h-50, size: 9, font: bold, color: blue });
    page.drawText(`${d.day} ${d.monthTh} ${d.year}`, { x: x+45, y: y+h-50, size: 9, font: regular, color: blue });

    page.drawText('เวลา', { x: x+8, y: y+h-64, size: 9, font: bold, color: blue });
    page.drawText(d.time, { x: x+45, y: y+h-64, size: 9, font: regular, color: blue });
  }

  // ─── Rounded rect (stamp #1 only) ────────────────────────────────────────

  private drawRoundedRect(page: any, x: number, y: number, w: number, h: number, r: number, fill: any, border: any, bw: number) {
    const cr = Math.min(r, w / 2, h / 2);
    page.drawSvgPath(
      `M ${cr},0 L ${w-cr},0 Q ${w},0 ${w},${cr} L ${w},${h-cr} Q ${w},${h} ${w-cr},${h} L ${cr},${h} Q 0,${h} 0,${h-cr} L 0,${cr} Q 0,0 ${cr},0 Z`,
      { x, y: y + h, color: fill, borderColor: border, borderWidth: bw },
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private truncate(text: string, font: any, size: number, maxW: number): string {
    let t = text;
    while (t.length > 0 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -1);
    return t;
  }

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
