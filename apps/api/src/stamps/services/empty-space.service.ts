import { Injectable, Logger } from '@nestjs/common';

export interface StampSpec {
  w: number;
  h: number;
  minW?: number; // minimum width to try (for dynamic-width stamps)
  preference: 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right' | 'lower-half-ltr' | 'any';
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
   * For `lower-half-ltr` stamps, uses a 3-pass weighted algorithm:
   *   Pass 1 — strict empty, recheck against text items
   *   Pass 2 — ≤20% grid overlap + weighted score, recheck ≤3 overlapping items
   *   Pass 3 — minimum weighted score, always accept
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

      // Find zones
      const zones: StampZone[] = [];
      let ltrSlot = 0;
      for (const spec of specs) {
        const zone = spec.preference === 'lower-half-ltr'
          ? this.findLowerHalfLtr(grid, cols, rows, spec, pageW, pageH, ltrSlot++, textRects)
          : this.findBest(grid, cols, rows, spec, pageW, pageH);
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

  // ─── Lower-half LTR: 3-pass weighted algorithm ─────────────────────────────

  /**
   * Three-pass scan with weighted scoring and text-item recheck.
   *
   * The key insight: Thai official documents have right-aligned signatures
   * at ~20-30% from page bottom, leaving the LEFT side relatively empty
   * at that level. The weighted score steers stamps towards that zone
   * instead of the footer area at the very bottom.
   *
   *  score = overlapCells × 10 + |position − idealY|
   *
   *  Pass 1 (strict):      grid-empty in bottom 40%,  recheck 0 text items
   *  Pass 2 (relaxed):     ≤20% grid overlap in bottom 55%,  recheck ≤3 items
   *  Pass 3 (best-effort): minimum score in bottom 70%,  always accept
   */
  private findLowerHalfLtr(
    grid: Uint8Array, cols: number, rows: number,
    spec: StampSpec, pageW: number, pageH: number,
    slotIndex: number,
    textRects: TextRect[],
  ): StampZone {
    const CELL = this.CELL;
    const maxW = spec.w;
    const minW = spec.minW ?? spec.w;
    // Try widths from max down to min in 20pt steps
    const widths: number[] = [];
    for (let w = maxW; w >= minW; w -= 20) widths.push(w);
    if (widths[widths.length - 1] !== minW) widths.push(minW);

    const needRows = Math.ceil(spec.h / CELL);

    // Ideal y for stamps: ~25% from page bottom (signature zone for Thai docs)
    const idealGy = Math.floor(rows * 0.25);

    // ── Pass 1 (strict): fully empty in bottom 40%, recheck 0 text items ────
    const limit1 = Math.floor(rows * 0.40);
    for (const tryW of widths) {
      const tryCols = Math.ceil(tryW / CELL);
      for (let gy = 0; gy <= limit1 - needRows; gy++) {
        for (let gx = 0; gx <= cols - tryCols; gx++) {
          if (!this.isRectEmpty(grid, cols, gx, gy, tryCols, needRows)) continue;
          const px = gx * CELL;
          const py = gy * CELL;
          if (this.countOverlappingItems(px, py, tryW, spec.h, textRects) === 0) {
            this.logger.debug(`Stamp LTR#${slotIndex} — Pass 1 (strict) w=${tryW} at grid(${gx},${gy})`);
            return { x: px, y: py, w: tryW, h: spec.h };
          }
        }
      }
    }

    // ── Pass 2 (relaxed): ≤20% overlap, weighted score, bottom 55% ──────────
    const limit2 = Math.floor(rows * 0.55);
    for (const tryW of widths) {
      const tryCols = Math.ceil(tryW / CELL);
      const totalCells = tryCols * needRows;
      const maxOcc2 = Math.floor(totalCells * 0.20);
      const best2 = this.scanWeighted(grid, cols, rows, tryCols, needRows, idealGy, limit2, maxOcc2);
      if (best2) {
        const px = best2.gx * CELL;
        const py = best2.gy * CELL;
        const itemOverlaps = this.countOverlappingItems(px, py, tryW, spec.h, textRects);
        if (itemOverlaps <= 3) {
          this.logger.debug(
            `Stamp LTR#${slotIndex} — Pass 2 (relaxed) w=${tryW} at grid(${best2.gx},${best2.gy}), ` +
            `gridOcc=${best2.occ}/${totalCells}, textItems=${itemOverlaps}`,
          );
          return { x: px, y: py, w: tryW, h: spec.h };
        }
      }
    }

    // ── Pass 3 (best-effort): minimum score in bottom 70%, always accept ────
    const limit3 = Math.floor(rows * 0.70);
    let bestZone: StampZone | null = null;
    let bestScore = Infinity;
    for (const tryW of widths) {
      const tryCols = Math.ceil(tryW / CELL);
      const totalCells = tryCols * needRows;
      const best3 = this.scanWeighted(grid, cols, rows, tryCols, needRows, idealGy, limit3, totalCells);
      if (best3 && best3.score < bestScore) {
        bestScore = best3.score;
        bestZone = { x: best3.gx * CELL, y: best3.gy * CELL, w: tryW, h: spec.h };
      }
    }
    if (bestZone) {
      this.logger.debug(
        `Stamp LTR#${slotIndex} — Pass 3 (best-effort) w=${bestZone.w}, score=${bestScore}`,
      );
      return bestZone;
    }

    // Ultimate fallback
    return { x: 40, y: Math.round(pageH * 0.20), w: minW, h: spec.h };
  }

  /**
   * Scan all positions up to `limitRow` and return the one with the lowest
   * weighted score:  score = occupiedCells × 10 + |centerGy − idealGy|
   *
   * Only considers positions where occupied cells ≤ maxOccupied.
   */
  private scanWeighted(
    grid: Uint8Array, cols: number, rows: number,
    needCols: number, needRows: number,
    idealGy: number,
    limitRow: number,
    maxOccupied: number,
  ): { gx: number; gy: number; occ: number; score: number } | null {
    let best: { gx: number; gy: number; occ: number; score: number } | null = null;

    for (let gy = 0; gy <= limitRow - needRows; gy++) {
      for (let gx = 0; gx <= cols - needCols; gx++) {
        const occ = this.countOccupied(grid, cols, gx, gy, needCols, needRows);
        if (occ > maxOccupied) continue;

        const centerGy = gy + Math.floor(needRows / 2);
        const posPenalty = Math.abs(centerGy - idealGy);
        const score = occ * 10 + posPenalty;

        if (!best || score < best.score) {
          best = { gx, gy, occ, score };
        }
      }
    }
    return best;
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
    let ltrSlot = 0;
    return specs.map((spec) => {
      switch (spec.preference) {
        case 'top-right':
          return { x: pageW - spec.w - 2, y: pageH - spec.h - 12, w: spec.w, h: spec.h };
        case 'top-left':
          return { x: 40, y: pageH - spec.h - 12, w: spec.w, h: spec.h };
        case 'lower-half-ltr': {
          const fbW = spec.minW ?? spec.w;
          const slotX = ltrSlot % 2 === 0
            ? Math.round(pageW * 0.04)
            : Math.round(pageW * 0.04) + fbW + 10;
          ltrSlot++;
          return { x: slotX, y: Math.round(pageH * 0.20), w: fbW, h: spec.h };
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
