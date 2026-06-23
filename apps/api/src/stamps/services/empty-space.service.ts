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
        isEvalSupported: false, // mitigate CVE-2024-4367 (eval-based RCE via crafted PDF)
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

  // ─── Image-PDF placement (raster CV + Vision fallback) ──────────────────
  //
  // Strategy for scanned/image PDFs (pdfjs-dist returns 0 text items):
  //   1. CV raster (primary): render page → binarize → find "closing section
  //      start" = first ink row after a blank gap in bottom 50%. This is the
  //      Y of "ขอแสดงความนับถือ"-equivalent on the raster.
  //   2. Vision (fallback): ask Gemini for closeY fraction if raster fails.
  //   3. Safe default (0.25 × pageH from bottom) if both unavailable.
  //
  // Stamp 2 (left) and Stamp 3 (right) share the SAME Y — TOP baseline
  // aligned to the detected closing-section start. X is fixed at left/right
  // margins (10pt from page edges).

  private async findStampZonesForImagePdf(
    pdfBuffer: Buffer, specs: StampSpec[],
    pageW: number, pageH: number, signaturePageIndex: number,
  ): Promise<StampZoneResult> {
    // 1. Try raster CV first (fast, pixel-accurate, no API call)
    let closingY = await this.findClosingSectionYFromRaster(pdfBuffer, signaturePageIndex, pageH);
    let source: 'raster' | 'vision' | 'default' = closingY !== null ? 'raster' : 'default';

    // 2. Fallback: Vision API
    if (closingY === null) {
      closingY = await this.detectCloseYFromVision(pdfBuffer, pageH);
      if (closingY !== null) source = 'vision';
    }

    const zones: StampZone[] = specs.map((spec) => {
      switch (spec.preference) {
        case 'top-right':
          return { x: Math.max(8, pageW - spec.w - 8), y: pageH - spec.h - 8, w: spec.w, h: spec.h };
        case 'top-left':
          return { x: 8, y: pageH - spec.h - 8, w: spec.w, h: spec.h };
        case 'lower-half-left': {
          const topY = closingY ?? pageH * 0.25;
          const y = Math.max(10, Math.min(topY - spec.h, pageH - spec.h - 10));
          return { x: 10, y, w: spec.w, h: spec.h };
        }
        case 'lower-half-right': {
          // Same Y as stamp 2 per user spec — consistency is important for Thai letters
          const topY = closingY ?? pageH * 0.25;
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

    this.logger.debug(
      `Image-PDF placement [${source}] — closingY=${closingY?.toFixed(0) ?? 'n/a'} (pageH=${pageH.toFixed(0)})`,
    );

    return { zones, signaturePageIndex, isImagePdf: true };
  }

  /**
   * Primary CV method for image/scanned PDFs.
   *
   * Renders the signature page to a 1500px-wide raster using @napi-rs/canvas,
   * builds a binary ink mask (gray < 200 = ink), then finds the FIRST ink row
   * in the bottom 50% of the page that appears AFTER a significant blank gap.
   *
   * In Thai official letters this pattern reliably maps to the top of the
   * closing section — the row containing "ขอแสดงความนับถือ" — which is the
   * same baseline the text-PDF path uses as `closeY`.
   *
   * Returns pdf-lib Y (from bottom) or null if rendering / detection fails.
   */
  private async findClosingSectionYFromRaster(
    pdfBuffer: Buffer, pageIndex: number, pageHPt: number,
  ): Promise<number | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createCanvas } = require('@napi-rs/canvas');

      const doc = await pdfjsLib.getDocument({
        data: new Uint8Array(pdfBuffer),
        disableFontFace: true,
        useSystemFonts: false,
        isEvalSupported: false, // mitigate CVE-2024-4367 (eval-based RCE via crafted PDF)
      }).promise;

      const page = await doc.getPage(pageIndex + 1);
      const vp1 = page.getViewport({ scale: 1.0 });

      // Normalize to fixed raster width so kernel / density thresholds stay constant
      const TARGET_W = 1500;
      const scale = TARGET_W / vp1.width;
      const vp = page.getViewport({ scale });
      const imgW = Math.floor(vp.width);
      const imgH = Math.floor(vp.height);

      const canvas = createCanvas(imgW, imgH);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, imgW, imgH);

      // Custom canvasFactory so pdfjs doesn't attempt to require node-canvas
      const canvasFactory = {
        create(w: number, h: number) {
          const c = createCanvas(w, h);
          return { canvas: c, context: c.getContext('2d') };
        },
        reset(obj: any, w: number, h: number) {
          obj.canvas.width = w;
          obj.canvas.height = h;
        },
        destroy(obj: any) {
          obj.canvas.width = 0;
          obj.canvas.height = 0;
          obj.canvas = null;
          obj.context = null;
        },
      };

      await page.render({
        canvasContext: ctx as any,
        viewport: vp,
        canvasFactory,
      }).promise;

      const imageData = ctx.getImageData(0, 0, imgW, imgH);

      // ── Row-density histogram in bottom 50%, ignoring 5% edge margins ──
      const rowStart = Math.floor(imgH * 0.50);
      const rowEnd = Math.floor(imgH * 0.97);
      const marginX = Math.floor(imgW * 0.05);
      const usableW = imgW - 2 * marginX;
      const INK_GRAY = 200;

      const rowInk = new Int32Array(rowEnd - rowStart + 1);
      for (let y = rowStart; y <= rowEnd; y++) {
        let count = 0;
        const rowBase = y * imgW;
        for (let x = marginX; x < imgW - marginX; x++) {
          const pi = (rowBase + x) * 4;
          const gray = (imageData.data[pi] + imageData.data[pi + 1] + imageData.data[pi + 2]) / 3;
          if (gray < INK_GRAY) count++;
        }
        rowInk[y - rowStart] = count;
      }

      // ── Find start of closing section = first ink row after a gap ──
      // Body → gap (blank rows) → "ขอแสดงความนับถือ" (ink resumes)
      const inkThresh = Math.max(3, Math.floor(usableW * 0.003));  // ≥0.3% of width = real content
      const minGapRows = Math.max(6, Math.floor(imgH * 0.015));     // ≥1.5% page height = significant gap

      let inGap = false;
      let gapLen = 0;
      let closingYImage: number | null = null;

      for (let i = 0; i < rowInk.length; i++) {
        const hasInk = rowInk[i] > inkThresh;
        if (!hasInk) {
          gapLen++;
          if (gapLen >= minGapRows) inGap = true;
        } else {
          if (inGap) {
            closingYImage = rowStart + i;
            break;
          }
          gapLen = 0;
        }
      }

      // Secondary fallback: if no gap-then-ink pattern, use first ink row in bottom 50%
      if (closingYImage === null) {
        for (let i = 0; i < rowInk.length; i++) {
          if (rowInk[i] > inkThresh) { closingYImage = rowStart + i; break; }
        }
      }

      if (closingYImage === null) return null;

      const fromTop = closingYImage / imgH;
      return pageHPt * (1 - fromTop);
    } catch (err) {
      this.logger.warn(`Raster CV failed: ${(err as Error).message}`);
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
