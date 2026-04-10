import { Injectable, Logger } from '@nestjs/common';

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

/** Bounding rect for an extracted text item (PDF points, y from bottom). */
interface TextRect {
  x: number; y: number; w: number; h: number;
}

@Injectable()
export class EmptySpaceService {
  private readonly logger = new Logger(EmptySpaceService.name);
  private readonly CELL = 10;

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
  async findStampZones(pdfBuffer: Buffer, specs: StampSpec[]): Promise<StampZone[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';

      const doc = await pdfjsLib.getDocument({
        data: new Uint8Array(pdfBuffer),
        disableFontFace: true,
        useSystemFonts: false,
      }).promise;

      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageW = viewport.width;
      const pageH = viewport.height;

      const CELL = this.CELL;
      const cols = Math.ceil(pageW / CELL);
      const rows = Math.ceil(pageH / CELL);
      const grid = new Uint8Array(cols * rows);

      this.markBorder(grid, cols, rows, 2);

      // Extract text items → grid + text rects for recheck
      const textContent = await page.getTextContent();
      const textRects: TextRect[] = [];

      for (const item of textContent.items as any[]) {
        if (!item.transform) continue;
        const ix = item.transform[4];
        const iy = item.transform[5];
        const iw = Math.max(item.width ?? 0, 6);
        const ih = Math.max(item.height ?? 12, 10);
        // Grid marking: generous padding for Thai diacritics + line spacing
        this.markArea(grid, cols, rows, ix - 8, iy - 6, iw + 16, ih + 20);
        // Store actual rect for text-item recheck (tighter, no padding)
        textRects.push({ x: ix, y: iy, w: iw, h: ih });
      }

      // Detect complimentary close Y level (คำลงท้าย)
      const closeY = this.detectComplimentaryCloseY(textContent.items as any[], pageH);
      if (closeY !== null) {
        this.logger.debug(`Complimentary close detected at Y=${closeY}`);
      }

      // Find zones
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

      return zones;
    } catch (e) {
      this.logger.warn(`Empty-space detection failed (${e.message}) — using fallback positions`);
      return this.fallback(specs);
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
   * Only considers items in the bottom 45% of the page to avoid
   * false positives from similar phrases in the body text.
   * Returns the Y coordinate (pdf-lib, from bottom) or null if not found.
   */
  private detectComplimentaryCloseY(items: any[], pageH: number): number | null {
    const yLimit = pageH * 0.45; // only bottom 45% of page
    for (const item of items) {
      if (!item.transform || !item.str) continue;
      const itemY: number = item.transform[5];
      if (itemY > yLimit) continue; // skip items in upper 55%
      const str: string = item.str.trim();
      for (const phrase of this.CLOSE_PHRASES) {
        if (str.includes(phrase)) {
          this.logger.debug(`Close phrase "${phrase}" found at Y=${itemY}`);
          return itemY;
        }
      }
    }
    return null;
  }

  // ─── Lower-half fixed-X placement ──────────────────────────────────────────

  /**
   * Place stamp at a fixed X (left margin 10 or right margin 10).
   *
   * If complimentary close Y was detected, anchors the stamp top at that Y level.
   * Otherwise scans bottom 60% for the best Y using weighted scoring.
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

    // If complimentary close detected, place stamp top at that Y level
    if (closeY !== null) {
      // closeY is the baseline of the close text — place stamp top there
      // stamp top = closeY, stamp bottom = closeY - h
      const py = Math.max(closeY - spec.h, 10);
      this.logger.debug(
        `Stamp ${spec.preference} — anchored to close Y=${closeY}, placed at (${fixedX}, ${py})`,
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
