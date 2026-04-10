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
  private readonly CELL = 10; // grid cell size in points

  /**
   * Find non-overlapping empty zones for each stamp spec.
   * Uses pdfjs-dist to extract text bounding boxes, builds a coverage grid,
   * then finds the best empty rectangle for each stamp via a 3-loop strategy.
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

      // Mark a 2-cell border margin as occupied
      this.markBorder(grid, cols, rows, 2);

      // Extract text items and mark their grid cells as occupied.
      // Padding: 8pt horizontal, 14pt above baseline (Thai diacritics + leading),
      // 6pt below baseline (descenders).
      const textContent = await page.getTextContent();
      for (const item of textContent.items as any[]) {
        if (!item.transform) continue;
        const ix = item.transform[4];           // x from left
        const iy = item.transform[5];           // y from bottom (baseline)
        const iw = Math.max(item.width ?? 0, 6);
        const ih = Math.max(item.height ?? 12, 10);
        this.markArea(grid, cols, rows, ix - 8, iy - 6, iw + 16, ih + 20);
      }

      // Find a zone for each stamp, marking each as occupied before finding the next
      const zones: StampZone[] = [];
      let ltrSlot = 0;
      for (const spec of specs) {
        const zone = spec.preference === 'lower-half-ltr'
          ? this.findLowerHalfLtr(grid, cols, rows, spec, pageW, pageH, ltrSlot++)
          : this.findBest(grid, cols, rows, spec, pageW, pageH);
        zones.push(zone);
        // Mark this zone so the next stamp doesn't overlap
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

  /** Check if a rectangle in the grid is completely empty. */
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

  /** Count how many cells are occupied within a rectangle. */
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

  // ─── Lower-half left-to-right finder (3-loop strategy) ─────────────────────

  /**
   * Three-pass scan to find the best position for a stamp in the lower page.
   *
   * gy=0 = page bottom, gy=rows-1 = page top.
   * All three loops scan bottom → upward, left → right.
   *
   *  Loop 1 (strict):      100% empty rectangle in bottom 45%
   *  Loop 2 (relaxed):     ≤ 15% overlap, best fit in bottom 55%
   *  Loop 3 (best-effort): minimum overlap in bottom 65%
   *
   * Each loop expands the search area slightly so earlier loops prefer
   * positions deeper in the lower portion. Loop 3 always succeeds because
   * it picks the least-overlapping position rather than requiring a threshold.
   *
   * We NEVER fall back to the upper half — placing stamps over document
   * headers / body text is always worse than the lower portion where
   * signatures and closings live.
   */
  private findLowerHalfLtr(
    grid: Uint8Array, cols: number, rows: number,
    spec: StampSpec, pageW: number, pageH: number,
    slotIndex: number,
  ): StampZone {
    const CELL = this.CELL;
    const needCols = Math.ceil(spec.w / CELL);
    const needRows = Math.ceil(spec.h / CELL);
    const totalCells = needCols * needRows;

    // ── Loop 1 (strict): fully empty, bottom 45% ───────────────────────────
    const limit1 = Math.floor(rows * 0.45);
    for (let gy = 0; gy <= limit1 - needRows; gy++) {
      for (let gx = 0; gx <= cols - needCols; gx++) {
        if (this.isRectEmpty(grid, cols, gx, gy, needCols, needRows)) {
          this.logger.debug(`Stamp LTR#${slotIndex} — Loop 1 (strict) at (${gx},${gy})`);
          return { x: gx * CELL, y: gy * CELL, w: spec.w, h: spec.h };
        }
      }
    }

    // ── Loop 2 (relaxed): ≤ 15% overlap, bottom 55% ────────────────────────
    const limit2 = Math.floor(rows * 0.55);
    const maxOcc2 = Math.floor(totalCells * 0.15);
    let best2: { gx: number; gy: number; occ: number } | null = null;
    search2: for (let gy = 0; gy <= limit2 - needRows; gy++) {
      for (let gx = 0; gx <= cols - needCols; gx++) {
        const occ = this.countOccupied(grid, cols, gx, gy, needCols, needRows);
        if (occ <= maxOcc2 && (!best2 || occ < best2.occ)) {
          best2 = { gx, gy, occ };
          if (occ === 0) break search2; // perfect — stop early
        }
      }
    }
    if (best2) {
      this.logger.debug(
        `Stamp LTR#${slotIndex} — Loop 2 (relaxed) at (${best2.gx},${best2.gy}), ` +
        `overlap=${best2.occ}/${totalCells} (${Math.round(best2.occ / totalCells * 100)}%)`,
      );
      return { x: best2.gx * CELL, y: best2.gy * CELL, w: spec.w, h: spec.h };
    }

    // ── Loop 3 (best-effort): minimum overlap, bottom 65% ──────────────────
    const limit3 = Math.floor(rows * 0.65);
    let best3 = { gx: 2, gy: 2, occ: totalCells + 1 };
    for (let gy = 0; gy <= limit3 - needRows; gy++) {
      for (let gx = 0; gx <= cols - needCols; gx++) {
        const occ = this.countOccupied(grid, cols, gx, gy, needCols, needRows);
        if (occ < best3.occ) {
          best3 = { gx, gy, occ };
          if (occ === 0) break; // can't improve
        }
      }
      if (best3.occ === 0) break;
    }
    this.logger.debug(
      `Stamp LTR#${slotIndex} — Loop 3 (best-effort) at (${best3.gx},${best3.gy}), ` +
      `overlap=${best3.occ}/${totalCells} (${Math.round(best3.occ / totalCells * 100)}%)`,
    );
    return { x: best3.gx * CELL, y: best3.gy * CELL, w: spec.w, h: spec.h };
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
    let ltrSlot = 0;
    return specs.map((spec) => {
      switch (spec.preference) {
        case 'top-right':
          return { x: pageW - spec.w - 2, y: pageH - spec.h - 12, w: spec.w, h: spec.h };
        case 'top-left':
          return { x: 40, y: pageH - spec.h - 12, w: spec.w, h: spec.h };
        case 'lower-half-ltr': {
          const bottomY = Math.round(pageH * 0.08);
          const slotX = ltrSlot % 2 === 0
            ? Math.round(pageW * 0.04)
            : Math.round(pageW * 0.04) + spec.w + 10;
          ltrSlot++;
          return { x: slotX, y: bottomY, w: spec.w, h: spec.h };
        }
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
