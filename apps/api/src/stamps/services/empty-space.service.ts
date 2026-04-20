import { Injectable, Logger } from '@nestjs/common';
import { GeminiApiService } from '../../gemini/gemini-api.service';

export interface StampSpec {
  w: number;
  h: number;
  preference: 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right' | 'lower-half-left' | 'lower-half-right' | 'any';
}

export interface StampZone {
  x: number; // left edge (pt from left, pdf-lib coordinate)
  y: number; // bottom edge (pt from bottom, pdf-lib coordinate)
  w: number;
  h: number;
}

export interface StampZoneResult {
  zones: StampZone[];
  signaturePageIndex: number; // 0-based page index where signature was found
  isImagePdf: boolean;        // true = scanned/image PDF (placements came from Vision, not grid)
}

/** Bounding rect for an extracted text item (PDF points, y from bottom). */
interface TextRect {
  x: number; y: number; w: number; h: number;
}

@Injectable()
export class EmptySpaceService {
  private readonly logger = new Logger(EmptySpaceService.name);
  private readonly CELL = 10;

  constructor(private readonly gemini: GeminiApiService) {}

  /**
   * Find non-overlapping empty zones for each stamp spec.
   *
   * For `lower-half-left` / `lower-half-right` stamps, uses fixed X positions
   * (left margin 10px / right margin 10px) and scans for the best Y in the
   * lower half of the page using weighted scoring.
   *
   * After each stamp is placed, its zone is marked occupied so the next stamp
   * gets a non-overlapping position.
   */
  async findStampZones(pdfBuffer: Buffer, specs: StampSpec[]): Promise<StampZoneResult> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';

      const doc = await pdfjsLib.getDocument({
        data: new Uint8Array(pdfBuffer),
        disableFontFace: true,
        useSystemFonts: false,
      }).promise;

      // Scan up to 4 pages — find the last page containing a complimentary close phrase
      const numPages = Math.min(doc.numPages, 4);
      let signaturePageIndex = 0; // default: page 1 (0-based)
      for (let pi = 0; pi < numPages; pi++) {
        const pg = await doc.getPage(pi + 1);
        const tc = await pg.getTextContent();
        const vp = pg.getViewport({ scale: 1.0 });
        const closeY = this.detectComplimentaryCloseY(tc.items as any[], vp.height);
        if (closeY !== null) {
          signaturePageIndex = pi;
          this.logger.debug(`Complimentary close found on page ${pi + 1} at Y=${closeY}`);
        }
      }

      const page = await doc.getPage(signaturePageIndex + 1);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageW = viewport.width;
      const pageH = viewport.height;

      const textContent = await page.getTextContent();

      // ── Image-PDF branch ────────────────────────────────────────────────
      // pdfjs-dist returns empty items for scanned/rasterized PDFs → grid
      // detection is useless. Use Vision directly for per-stamp Y targets.
      if (textContent.items.length === 0) {
        this.logger.log(`Image-based PDF detected (page ${signaturePageIndex + 1}) — using Vision placement`);
        return this.findStampZonesForImagePdf(pdfBuffer, specs, pageW, pageH, signaturePageIndex);
      }

      // ── Text-PDF branch (existing grid-based logic) ────────────────────
      const CELL = this.CELL;
      const cols = Math.ceil(pageW / CELL);
      const rows = Math.ceil(pageH / CELL);
      const grid = new Uint8Array(cols * rows);

      this.markBorder(grid, cols, rows, 2);

      const textRects: TextRect[] = [];
      for (const item of textContent.items as any[]) {
        if (!item.transform) continue;
        const ix = item.transform[4];
        const iy = item.transform[5];
        const iw = Math.max(item.width ?? 0, 6);
        const ih = Math.max(item.height ?? 12, 10);
        this.markArea(grid, cols, rows, ix - 8, iy - 6, iw + 16, ih + 20);
        textRects.push({ x: ix, y: iy, w: iw, h: ih });
      }

      const closeY = this.detectComplimentaryCloseY(textContent.items as any[], pageH);
      if (closeY !== null) {
        this.logger.debug(`Complimentary close at Y=${closeY} on page ${signaturePageIndex + 1}`);
      }

      const zones: StampZone[] = [];
      for (const spec of specs) {
        let zone: StampZone;
        if (spec.preference === 'lower-half-left' || spec.preference === 'lower-half-right') {
          zone = this.findLowerHalfFixed(grid, cols, rows, spec, pageW, pageH, textRects, closeY);
        } else {
          zone = this.findBest(grid, cols, rows, spec, pageW, pageH);
        }
        zones.push(zone);
        this.markArea(grid, cols, rows, zone.x - 4, zone.y - 4, zone.w + 8, zone.h + 8);
      }

      return { zones, signaturePageIndex, isImagePdf: false };
    } catch (e) {
      this.logger.warn(`Empty-space detection failed (${e.message}) — using fallback positions`);
      return { zones: this.fallback(specs), signaturePageIndex: 0, isImagePdf: false };
    }
  }

  // ─── Image-PDF placement (Vision-based) ──────────────────────────────────
  //
  // Scanned PDFs have no extractable text → grid is empty → old weighted-scan
  // picked positions blindly and stamps overlapped ink. Instead we ask Gemini
  // Vision for per-stamp Y targets based on actual pixel content.

  private async findStampZonesForImagePdf(
    pdfBuffer: Buffer, specs: StampSpec[],
    pageW: number, pageH: number, signaturePageIndex: number,
  ): Promise<StampZoneResult> {
    const targets = await this.detectStampTargetsFromVision(pdfBuffer, pageH);

    const zones: StampZone[] = specs.map((spec) => {
      switch (spec.preference) {
        case 'top-right':
          return {
            x: Math.max(8, pageW - spec.w - 8),
            y: pageH - spec.h - 8,
            w: spec.w, h: spec.h,
          };
        case 'top-left':
          return { x: 8, y: pageH - spec.h - 8, w: spec.w, h: spec.h };
        case 'lower-half-left': {
          // Stamp 2 — TOP aligned to Vision's stamp2Y (pdf-lib coord from bottom)
          const topY = targets?.stamp2Y ?? pageH * 0.25;
          const y = Math.max(10, Math.min(topY - spec.h, pageH - spec.h - 10));
          return { x: 10, y, w: spec.w, h: spec.h };
        }
        case 'lower-half-right': {
          const topY = targets?.stamp3Y ?? pageH * 0.18;
          const y = Math.max(10, Math.min(topY - spec.h, pageH - spec.h - 10));
          return { x: Math.max(8, pageW - spec.w - 10), y, w: spec.w, h: spec.h };
        }
        case 'bottom-left':
          return { x: 40, y: 80, w: spec.w, h: spec.h };
        case 'bottom-right':
          return { x: Math.max(8, pageW - spec.w - 40), y: 80, w: spec.w, h: spec.h };
        default:
          return { x: 40, y: 80, w: spec.w, h: spec.h };
      }
    });

    if (targets) {
      this.logger.debug(
        `Image-PDF Vision placement — stamp2Y=${targets.stamp2Y.toFixed(0)}, stamp3Y=${targets.stamp3Y.toFixed(0)} (pageH=${pageH.toFixed(0)})`,
      );
    } else {
      this.logger.warn('Vision placement unavailable — using safe defaults for image PDF');
    }

    return { zones, signaturePageIndex, isImagePdf: true };
  }

  /**
   * Ask Gemini Vision for safe per-stamp Y targets on an image/scanned PDF.
   * Returns TOP baselines (pdf-lib Y, from bottom) for stamp 2 (left) and
   * stamp 3 (right) — each chosen to land on actual whitespace.
   */
  private async detectStampTargetsFromVision(
    pdfBuffer: Buffer, pageH: number,
  ): Promise<{ stamp2Y: number; stamp3Y: number } | null> {
    if (!this.gemini.getApiKey()) return null;
    try {
      const base64 = pdfBuffer.toString('base64');
      const prompt =
        'นี่คือหนังสือราชการไทยที่สแกนเป็นรูปภาพ (image-based PDF). ' +
        'เราจะประทับตรา 2 ตรา ลงบน "พื้นที่ว่างสีขาว" ของหน้านี้ — ' +
        'ห้ามทับตัวอักษร ลายเซ็น ตราประทับเดิม ภาพครุฑ หรือคำขวัญท้ายหน้า\n\n' +
        '- ตราที่ 2 (ขนาดประมาณ 220×120 จุด) วางชิดขอบซ้าย ระยะ 10 จุดจากซ้าย\n' +
        '- ตราที่ 3 (ขนาดประมาณ 180×80 จุด) วางชิดขอบขวา ระยะ 10 จุดจากขวา\n\n' +
        'สำหรับแต่ละตรา ให้ระบุตำแหน่ง "ขอบบนสุด" ของตรา เป็นสัดส่วนจากขอบบนของหน้า (0.0 = ติดบนสุด, 1.0 = ติดล่างสุด) ' +
        'เลือกพื้นที่ว่างที่สูงพอ (อย่างน้อย 90 จุด) และไม่ทับเนื้อหาใด ๆ\n\n' +
        'ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น:\n' +
        '{"stamp2TopFromTop": <0-1>, "stamp3TopFromTop": <0-1>}';

      const raw = await this.gemini.generateFromParts({
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
          { text: prompt },
        ],
        maxOutputTokens: 128,
        temperature: 0,
      });

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      const f2 = parsed?.stamp2TopFromTop;
      const f3 = parsed?.stamp3TopFromTop;
      if (typeof f2 !== 'number' || f2 < 0.3 || f2 > 0.99) return null;
      if (typeof f3 !== 'number' || f3 < 0.3 || f3 > 0.99) return null;

      // Convert top-fraction → pdf-lib Y (distance from bottom)
      return {
        stamp2Y: pageH * (1 - f2),
        stamp3Y: pageH * (1 - f3),
      };
    } catch (err) {
      this.logger.warn(`Vision stamp-targets failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ─── Grid helpers ───────────────────────────────────────────────────────────

  private markArea(
    grid: Uint8Array, cols: number, rows: number,
    x: number, y: number, w: number, h: number,
  ) {
    const CELL = this.CELL;
    const gx0 = Math.max(0, Math.floor(x / CELL));
    const gy0 = Math.max(0, Math.floor(y / CELL));
    const gx1 = Math.min(cols - 1, Math.ceil((x + w) / CELL));
    const gy1 = Math.min(rows - 1, Math.ceil((y + h) / CELL));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        grid[gy * cols + gx] = 1;
      }
    }
  }

  private markBorder(grid: Uint8Array, cols: number, rows: number, m: number) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < m; col++) grid[row * cols + col] = 1;
      for (let col = cols - m; col < cols; col++) grid[row * cols + col] = 1;
    }
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < m; row++) grid[row * cols + col] = 1;
      for (let row = rows - m; row < rows; row++) grid[row * cols + col] = 1;
    }
  }

  private isRectEmpty(
    grid: Uint8Array, cols: number,
    gx: number, gy: number, gw: number, gh: number,
  ): boolean {
    for (let row = gy; row < gy + gh; row++) {
      for (let col = gx; col < gx + gw; col++) {
        if (grid[row * cols + col] !== 0) return false;
      }
    }
    return true;
  }

  /** Count occupied cells within a grid rectangle. */
  private countOccupied(
    grid: Uint8Array, cols: number,
    gx: number, gy: number, gw: number, gh: number,
  ): number {
    let count = 0;
    for (let row = gy; row < gy + gh; row++) {
      for (let col = gx; col < gx + gw; col++) {
        if (grid[row * cols + col] !== 0) count++;
      }
    }
    return count;
  }

  /** Count how many actual text items overlap with a point-space rectangle. */
  private countOverlappingItems(
    x: number, y: number, w: number, h: number,
    items: TextRect[],
  ): number {
    let count = 0;
    for (const it of items) {
      if (it.x < x + w && it.x + it.w > x && it.y < y + h && it.y + it.h > y) {
        count++;
      }
    }
    return count;
  }

  // ─── Vision-based closeY detection (image PDFs) ─────────────────────────────

  /**
   * Ask Gemini Vision to estimate the Y position of the complimentary close /
   * signature block as a fraction of page height from the TOP (0.0–1.0).
   * Converts to pdf-lib Y (from bottom): closeY = pageH * (1 - fraction).
   * Returns null if Gemini is unavailable or response is unparseable.
   */
  private async detectCloseYFromVision(pdfBuffer: Buffer, pageH: number): Promise<number | null> {
    if (!this.gemini.getApiKey()) return null;
    try {
      const base64 = pdfBuffer.toString('base64');
      const prompt =
        'This is a Thai official letter PDF (image-based). ' +
        'Estimate the vertical position of the complimentary close line ' +
        '(e.g. "ขอแสดงความนับถือ") or the start of the signature block ' +
        'as a fraction of the total page height measured from the TOP of the page (0.0 = top, 1.0 = bottom). ' +
        'Reply with ONLY a JSON object: {"closeYFraction": <number>}';
      const raw = await this.gemini.generateFromParts({
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
          { text: prompt },
        ],
        maxOutputTokens: 64,
        temperature: 0,
      });
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      const fraction = parsed?.closeYFraction;
      if (typeof fraction !== 'number' || fraction < 0 || fraction > 1) return null;
      // Convert top-fraction → pdf-lib Y (from bottom)
      return pageH * (1 - fraction);
    } catch {
      return null;
    }
  }

  // ─── Complimentary close detection ──────────────────────────────────────────

  /**
   * Thai complimentary close phrases.
   * "ขอเชิญ" intentionally excluded — appears in body text as invitation verb.
   */
  private readonly CLOSE_PHRASES = [
    'ขอแสดงความนับถือ',
    'ด้วยความนับถือ',
    'ขอแสดงความเคารพ',
    'ด้วยความเคารพ',
  ];

  /**
   * Scan text items for a Thai complimentary close phrase.
   *
   * Returns the Y of the LOWEST (closest-to-bottom) match, so that a
   * stray "ด้วยความนับถือ" appearing in body text earlier on the page
   * does not win over the actual sign-off line near the signature.
   *
   * Only items in the bottom 65% of the page are considered.
   * Returns the Y coordinate (pdf-lib, from bottom) or null if not found.
   */
  private detectComplimentaryCloseY(items: any[], pageH: number): number | null {
    const yLimit = pageH * 0.65; // only bottom 65% of page
    let bestY: number | null = null;
    let bestPhrase = '';
    for (const item of items) {
      if (!item.transform || !item.str) continue;
      const itemY: number = item.transform[5];
      if (itemY > yLimit) continue;
      const str: string = item.str.trim();
      for (const phrase of this.CLOSE_PHRASES) {
        if (str.includes(phrase)) {
          if (bestY === null || itemY < bestY) {
            bestY = itemY;
            bestPhrase = phrase;
          }
          break;
        }
      }
    }
    if (bestY !== null) {
      this.logger.debug(`Close phrase "${bestPhrase}" — using lowest match at Y=${bestY}`);
    }
    return bestY;
  }

  // ─── Lower-half fixed-X placement ──────────────────────────────────────────

  /**
   * Place stamp at a fixed X (left margin 10 or right margin 10).
   *
   * Anchoring (in PDF coordinates, y grows upward):
   *  1. If a complimentary close ("ขอแสดงความนับถือ") is detected, the
   *     stamp TOP is aligned exactly to that baseline (closeY). Stamp
   *     content extends DOWNWARD from there (stamp occupies y=closeY-h
   *     to y=closeY). Because the signature block is typically right-
   *     aligned and the stamp uses a fixed left/right margin, the two
   *     do not overlap horizontally when:
   *       - stamp 2 is on the left (margin 10pt) and sig block is right
   *       - stamp 3 is on the right side below sig block
   *  2. If no close phrase is found, scan bottom 60% of the page for a
   *     low-density Y using weighted scoring.
   */
  private findLowerHalfFixed(
    grid: Uint8Array, cols: number, rows: number,
    spec: StampSpec, pageW: number, pageH: number,
    textRects: TextRect[],
    closeY: number | null,
  ): StampZone {
    const CELL = this.CELL;
    const needCols = Math.ceil(spec.w / CELL);
    const needRows = Math.ceil(spec.h / CELL);

    // Fixed X: left margin 10px or right margin 10px
    const fixedX = spec.preference === 'lower-half-left'
      ? 10
      : Math.round(pageW - spec.w - 10);

    // Align stamp TOP to complimentary close baseline
    if (closeY !== null) {
      const py = Math.max(closeY - spec.h, 10);
      this.logger.debug(
        `Stamp ${spec.preference} — TOP aligned to closeY=${closeY}, placed at (${fixedX}, ${py})`,
      );
      return { x: fixedX, y: py, w: spec.w, h: spec.h };
    }

    // Fallback: weighted scan in bottom 60%
    const fixedGx = Math.max(0, Math.floor(fixedX / CELL));
    const idealGy = Math.floor(rows * 0.25);
    const scanLimit = Math.floor(rows * 0.60);
    let bestGy = idealGy;
    let bestScore = Infinity;

    for (let gy = 0; gy <= scanLimit - needRows; gy++) {
      const gx = Math.min(fixedGx, cols - needCols);
      const occ = this.countOccupied(grid, cols, gx, gy, needCols, needRows);
      const centerGy = gy + Math.floor(needRows / 2);
      const posPenalty = Math.abs(centerGy - idealGy);
      const score = occ * 10 + posPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestGy = gy;
      }
    }

    const py = bestGy * CELL;
    this.logger.debug(
      `Stamp ${spec.preference} — no close detected, placed at (${fixedX}, ${py}), score=${bestScore}`,
    );
    return { x: fixedX, y: py, w: spec.w, h: spec.h };
  }

  // ─── Scored zone finder (for top-right / top-left etc.) ─────────────────────

  private findBest(
    grid: Uint8Array, cols: number, rows: number,
    spec: StampSpec, pageW: number, pageH: number,
  ): StampZone {
    const CELL = this.CELL;
    const needCols = Math.ceil(spec.w / CELL);
    const needRows = Math.ceil(spec.h / CELL);

    let bestScore = -Infinity;
    let bestGx = 1;
    let bestGy = 1;

    for (let gy = 0; gy <= rows - needRows; gy++) {
      for (let gx = 0; gx <= cols - needCols; gx++) {
        if (!this.isRectEmpty(grid, cols, gx, gy, needCols, needRows)) continue;

        const score = this.score(gx, gy, needCols, needRows, cols, rows, spec.preference);
        if (score > bestScore) {
          bestScore = score;
          bestGx = gx;
          bestGy = gy;
        }
      }
    }

    return {
      x: bestGx * CELL,
      y: bestGy * CELL,
      w: spec.w,
      h: spec.h,
    };
  }

  private score(
    gx: number, gy: number, gw: number, gh: number,
    cols: number, rows: number,
    preference: StampSpec['preference'],
  ): number {
    const relX = (gx + gw / 2) / cols;
    const relY = (gy + gh / 2) / rows;

    switch (preference) {
      case 'top-right':    return relX * 2 + relY * 3;
      case 'top-left':     return (1 - relX) * 2 + relY * 3;
      case 'bottom-left':  return (1 - relX) * 2 + (1 - relY) * 3;
      case 'bottom-right': return relX * 2 + (1 - relY) * 3;
      default:             return 1;
    }
  }

  // ─── Fallback (no pdfjs-dist or parse error) ────────────────────────────────

  private fallback(specs: StampSpec[]): StampZone[] {
    const pageW = 595;
    const pageH = 842;
    return specs.map((spec) => {
      switch (spec.preference) {
        case 'top-right':
          return { x: pageW - spec.w - 2, y: pageH - spec.h - 12, w: spec.w, h: spec.h };
        case 'top-left':
          return { x: 40, y: pageH - spec.h - 12, w: spec.w, h: spec.h };
        case 'lower-half-left':
          return { x: 10, y: Math.round(pageH * 0.20), w: spec.w, h: spec.h };
        case 'lower-half-right':
          return { x: pageW - spec.w - 10, y: Math.round(pageH * 0.20), w: spec.w, h: spec.h };
        case 'bottom-left':
          return { x: 40, y: 80, w: spec.w, h: spec.h };
        case 'bottom-right':
          return { x: pageW - spec.w - 40, y: 80, w: spec.w, h: spec.h };
        default:
          return { x: 40, y: 80, w: spec.w, h: spec.h };
      }
    });
  }
}
