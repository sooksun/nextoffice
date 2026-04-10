import { Injectable } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
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

// ─── Stamp dimensions ─────────────────────────────────────────────────────────

const S1_W = 160;
const S1_H = 70;
const W2   = 220; // stamp #2 width
const W3   = 180; // stamp #3 width

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class PdfStampService {
  constructor(
    private readonly emptySpace: EmptySpaceService,
    private readonly stampCanvas: StampCanvasService,
  ) {}

  async applyAllStamps(pdfBuffer: Buffer, data: AllStampsData): Promise<Buffer> {
    // ── 1. Compute content-box heights via canvas measurement ──────────────
    const h2 = this.stampCanvas.computeEndorsementHeight(data.endorsement, W2);
    const h3 = data.directorNote
      ? this.stampCanvas.computeDirectorNoteHeight(data.directorNote, W3)
      : 0;

    // ── 2. Find placement zones (pdfjs-dist text analysis) ─────────────────
    const specs = [
      { w: S1_W, h: S1_H, preference: 'top-right'       as const },
      { w: W2,   h: h2,   preference: 'lower-half-left'  as const },
      ...(data.directorNote
        ? [{ w: W3, h: h3, preference: 'lower-half-right' as const }]
        : []),
    ];

    const zones = await this.emptySpace.findStampZones(pdfBuffer, specs);

    // Stamp 1: y locked 8pt from top of page
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const page = pdfDoc.getPages()[0];
    const { height: pageH } = page.getSize();
    if (zones[0]) zones[0] = { ...zones[0], y: pageH - S1_H - 8 };
    // Stamp 3: shift up 60pt relative to computed zone
    if (zones[2]) zones[2] = { ...zones[2], y: zones[2].y + 60 };

    // ── 3. Render each stamp as PNG via Skia canvas ─────────────────────────
    const png1 = this.stampCanvas.renderRegistration(data.registration, S1_W, S1_H);
    const png2 = this.stampCanvas.renderEndorsement(data.endorsement, W2, h2);
    const png3 = data.directorNote
      ? this.stampCanvas.renderDirectorNote(data.directorNote, W3, h3)
      : null;

    // ── 4. Embed PNGs into PDF — pdf-lib is compositor only ─────────────────
    const [img1, img2] = await Promise.all([
      pdfDoc.embedPng(png1),
      pdfDoc.embedPng(png2),
    ]);
    const img3 = png3 ? await pdfDoc.embedPng(png3) : null;

    if (zones[0]) {
      page.drawImage(img1, {
        x: zones[0].x, y: zones[0].y,
        width: S1_W,   height: S1_H,
      });
    }

    if (zones[1]) {
      // PNG includes signature area below box
      page.drawImage(img2, {
        x:      zones[1].x,
        y:      zones[1].y - SIG_TOTAL,
        width:  W2,
        height: h2 + SIG_TOTAL,
      });
    }

    if (img3 && zones[2]) {
      page.drawImage(img3, {
        x:      zones[2].x,
        y:      zones[2].y - SIG_TOTAL,
        width:  W3,
        height: h3 + SIG_TOTAL,
      });
    }

    return Buffer.from(await pdfDoc.save());
  }
}
