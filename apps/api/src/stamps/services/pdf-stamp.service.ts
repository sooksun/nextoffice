import { Injectable } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { EmptySpaceService } from './empty-space.service';
import { StampCanvasService, SIG_TOTAL, SIG_TOTAL_SIG } from './stamp-canvas.service';

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
  signatureBuffer?: Buffer;
  assigneeNames?: string[];
}

export interface DirectorNoteStampData {
  noteText: string;
  authorName: string;
  positionTitle?: string;
  stampedAt: Date;
  signatureBuffer?: Buffer;
  assigneeNames?: string[];
}

export interface AllStampsData {
  registration: RegistrationStampData;
  endorsement: EndorsementStampData;
  directorNote?: DirectorNoteStampData;
}

export interface StampZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StampResult {
  pdfBuffer: Buffer;
  zones: (StampZone | null)[];
  scaleFactor: number;
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

  async applyAllStamps(pdfBuffer: Buffer, data: AllStampsData): Promise<StampResult> {
    // ── 0. Detect page scale relative to A4 (595pt) ────────────────────────
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const page = pdfDoc.getPages()[0];
    const { width: pageW, height: pageH } = page.getSize();
    const ss = Math.max(1.0, pageW / 595);

    // Scaled draw dimensions (pt in PDF space)
    const s1W = Math.round(S1_W * ss);
    const s1H = Math.round(S1_H * ss);
    const w2  = Math.round(W2 * ss);
    const w3  = Math.round(W3 * ss);

    // ── 1. Compute content-box heights at original A4 stamp widths ─────────
    const h2Orig = this.stampCanvas.computeEndorsementHeight(data.endorsement, W2);
    const h3Orig = data.directorNote
      ? this.stampCanvas.computeDirectorNoteHeight(data.directorNote, W3)
      : this.stampCanvas.computeDirectorNoteHeight(
          { noteText: 'placeholder', authorName: '', stampedAt: new Date() },
          W3,
        );
    const h2 = Math.round(h2Orig * ss);
    const h3 = Math.round(h3Orig * ss);

    // Choose correct SIG_TOTAL variant depending on whether signature images are present
    const sigTotal2 = Math.round((data.endorsement.signatureBuffer ? SIG_TOTAL_SIG : SIG_TOTAL) * ss);
    const sigTotal3 = data.directorNote
      ? Math.round((data.directorNote.signatureBuffer ? SIG_TOTAL_SIG : SIG_TOTAL) * ss)
      : Math.round(SIG_TOTAL * ss);

    // ── 2. Find placement zones — ALWAYS compute for all 3 stamps ─────────
    const specs = [
      { w: s1W, h: s1H, preference: 'top-right'       as const },
      { w: w2,  h: h2,  preference: 'lower-half-left'  as const },
      { w: w3,  h: h3,  preference: 'lower-half-right' as const },
    ];

    const { zones, signaturePageIndex } = await this.emptySpace.findStampZones(pdfBuffer, specs);

    // Stamp 1 always on page 1; stamps 2 & 3 on the signature page
    const sigPage = pdfDoc.getPages()[signaturePageIndex] ?? page;

    // Stamp 1: y locked 8pt from top of page (scaled)
    if (zones[0]) zones[0] = { ...zones[0], y: pageH - s1H - Math.round(8 * ss) };
    // Stamp 2: shift up 20pt from complimentary close baseline (scaled)
    if (zones[1]) zones[1] = { ...zones[1], y: zones[1].y + Math.round(20 * ss) };
    // Stamp 3: shift up 40pt relative to computed zone (scaled)
    if (zones[2]) zones[2] = { ...zones[2], y: zones[2].y + Math.round(40 * ss) };

    // ── 3. Render PNGs at original A4 dimensions (crisp 3× canvas) ─────────
    const [png1, png2, png3] = await Promise.all([
      Promise.resolve(this.stampCanvas.renderRegistration(data.registration, S1_W, S1_H)),
      this.stampCanvas.renderEndorsement(data.endorsement, W2, h2Orig),
      data.directorNote
        ? this.stampCanvas.renderDirectorNote(data.directorNote, W3, h3Orig)
        : Promise.resolve(null),
    ]);

    // ── 4. Embed PNGs into PDF — pdf-lib is compositor only ─────────────────
    const [img1, img2] = await Promise.all([
      pdfDoc.embedPng(png1),
      pdfDoc.embedPng(png2),
    ]);
    const img3 = png3 ? await pdfDoc.embedPng(png3) : null;

    // Stamp 1 → page 1
    if (zones[0]) {
      page.drawImage(img1, {
        x: zones[0].x, y: zones[0].y,
        width: s1W,    height: s1H,
      });
    }

    // Stamps 2 & 3 → signature page (may differ from page 1)
    if (zones[1]) {
      sigPage.drawImage(img2, {
        x:      zones[1].x,
        y:      zones[1].y - sigTotal2,
        width:  w2,
        height: h2 + sigTotal2,
      });
    }

    if (img3 && zones[2]) {
      sigPage.drawImage(img3, {
        x:      zones[2].x,
        y:      zones[2].y - sigTotal3,
        width:  w3,
        height: h3 + sigTotal3,
      });
    }

    // Build zone info for stamp 3 (always computed, even if not rendered)
    const stamp3Zone: StampZone | null = zones[2]
      ? { x: zones[2].x, y: zones[2].y, w: w3, h: h3 }
      : null;

    return {
      pdfBuffer: Buffer.from(await pdfDoc.save()),
      zones: [
        zones[0] ? { x: zones[0].x, y: zones[0].y, w: s1W, h: s1H } : null,
        zones[1] ? { x: zones[1].x, y: zones[1].y, w: w2,  h: h2  } : null,
        stamp3Zone,
      ],
      scaleFactor: ss,
    };
  }

  /**
   * Apply only stamp 3 (Director Note) onto an already-stamped PDF.
   * Uses pre-computed zone coordinates from the initial stamp pass.
   */
  async applyStamp3Only(
    pdfBuffer: Buffer,
    data: DirectorNoteStampData,
    zone: StampZone,
    scaleFactor: number,
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const page = pdfDoc.getPages()[0];

    // Compute stamp 3 content height at A4 width
    const h3Orig = this.stampCanvas.computeDirectorNoteHeight(data, W3);
    const h3 = Math.round(h3Orig * scaleFactor);
    const w3 = Math.round(W3 * scaleFactor);
    const sigTotal3 = Math.round(
      (data.signatureBuffer ? SIG_TOTAL_SIG : SIG_TOTAL) * scaleFactor,
    );

    // Render stamp 3 PNG
    const png3 = await this.stampCanvas.renderDirectorNote(data, W3, h3Orig);
    const img3 = await pdfDoc.embedPng(png3);

    // Draw at stored zone position
    page.drawImage(img3, {
      x:      zone.x,
      y:      zone.y - sigTotal3,
      width:  w3,
      height: h3 + sigTotal3,
    });

    return Buffer.from(await pdfDoc.save());
  }
}
