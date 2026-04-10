import { Injectable, Logger } from '@nestjs/common';

export interface StampSpec {
  w: number;
  h: number;
  preference: 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right' | 'lower-half-ltr' | 'any';
}

export interface StampZone {
  x: number; // left edge (pt from left, pdf-lib coordinate)
  y: number; // bottom edge (pt from bottom, pdf-lib coordinate)
  w: number;
  h: number;
}

@Injectable()
export class EmptySpaceService {
  private readonly logger = new Logger(EmptySpaceService.name);
  private readonly CELL = 18; // grid cell size in points

  /**
   * Find non-overlapping empty zones for each stamp spec.
   * Uses pdfjs-dist to extract text bounding boxes, builds a coverage grid,
   * then finds the best empty rectangle for each stamp.
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
      const pageW = viewport.width;   // usually 595 for A4
      const pageH = viewport.height;  // usually 842 for A4

      const CELL = this.CELL;
      const cols = Math.ceil(pageW / CELL);
      const rows = Math.ceil(pageH / CELL);
      const grid = new Uint8Array(cols * rows); // 0=empty, 1=occupied

      // Mark a 1-cell border margin as occupied so stamps don't touch the page edge
      this.markBorder(grid, cols, rows, 1);

      // Extract text items and mark their grid cells as occupied
      const textContent = await page.getTextContent();
      for (const item of textContent.items as any[]) {
        if (!item.transform) continue;
        const ix = item.transform[4];           // x from left
        const iy = item.transform[5];           // y from bottom
        const iw = Math.max(item.width ?? 0, 4);
        const ih = Math.max(item.height ?? 10, 8);
        this.markArea(grid, cols, rows, ix - 4, iy - 4, iw + 8, ih + 8);
      }

      // Find a zone for each stamp, marking each as occupied before finding the next
      const zones: StampZone[] = [];
      for (const spec of specs) {
        const zone = spec.preference === 'lower-half-ltr'
          ? this.findLowerHalfLtr(grid, cols, rows, spec, pageW, pageH)
          : this.findBest(grid, cols, rows, spec, pageW, pageH);
        zones.push(zone);
        // Mark this zone so the next stamp doesn't overlap
        this.markArea(grid, cols, rows, zone.x - 2, zone.y - 2, zone.w + 4, zone.h + 4);
      }

      return zones;
    } catch (e) {
      this.logger.warn(`Empty-space detection failed (${e.message}) — using fallback positions`);
      return this.fallback(specs);
    }
  }

  // ─── Grid helpers ───────────────────────────────────────────────────────────

  /** Mark a rectangular area in the grid as occupied.
   *  All coordinates are in PDF points (y from bottom). */
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

  // ─── Lower-half left-to-right finder ────────────────────────────────────────

  /**
   * Deterministic scan: starting from visual page-middle downward, left to right.
   * gy=0 = bottom of page, gy=rows-1 = top. Visual middle ≈ rows/2.
   * Scan gy from rows/2 → 0 (going down visually), gx left → right.
   * First empty rectangle wins. Falls back to upper half if nothing found.
   */
  private findLowerHalfLtr(
    grid: Uint8Array, cols: number, rows: number,
    spec: StampSpec, pageW: number, pageH: number,
  ): StampZone {
    const CELL = this.CELL;
    const needCols = Math.ceil(spec.w / CELL);
    const needRows = Math.ceil(spec.h / CELL);

    const startGy = Math.min(Math.floor(rows / 2), rows - needRows);

    // Primary scan: visual middle → bottom
    for (let gy = startGy; gy >= 0; gy--) {
      for (let gx = 0; gx <= cols - needCols; gx++) {
        if (this.isRectEmpty(grid, cols, gx, gy, needCols, needRows)) {
          return { x: gx * CELL, y: gy * CELL, w: spec.w, h: spec.h };
        }
      }
    }

    // Fallback scan: upper half (still left to right, top → middle)
    for (let gy = rows - needRows; gy > startGy; gy--) {
      for (let gx = 0; gx <= cols - needCols; gx++) {
        if (this.isRectEmpty(grid, cols, gx, gy, needCols, needRows)) {
          return { x: gx * CELL, y: gy * CELL, w: spec.w, h: spec.h };
        }
      }
    }

    return { x: 40, y: Math.round(pageH / 4), w: spec.w, h: spec.h };
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
    const relY = (gy + gh / 2) / rows; // 0=bottom … 1=top (PDF y-axis)

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
        case 'lower-half-ltr':
          return { x: 40, y: Math.round(pageH / 4), w: spec.w, h: spec.h };
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
