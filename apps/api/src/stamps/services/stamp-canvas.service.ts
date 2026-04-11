import { Injectable, Logger } from '@nestjs/common';
import { createCanvas, GlobalFonts, SKRSContext2D, loadImage } from '@napi-rs/canvas';
import * as path from 'path';
import * as fs from 'fs';
import * as wordcut from 'wordcut';
import { RegistrationStampData, EndorsementStampData, DirectorNoteStampData } from './pdf-stamp.service';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Pixel-per-point ratio: render at 3× for crisp PDF output */
const SCALE = 3;

/** Stamp blue colour */
const BLUE = 'rgb(18, 84, 177)';

/** Vertical padding below stamp box before signature block starts (pt) */
const SIG_GAP = 4;
/** Signature image height (pt) */
const SIG_IMG_H = 36;
/** Line height for name / position / date rows in the sig block (pt) */
const SIG_LH = 10;
/** How many pt the signature block is shifted UP into the box area */
const SIG_SHIFT_UP = 30;
/** Signature block height: name + position + date (in pt) */
const SIG_H = 34;
/** Total extra height below box — no signature image (in pt) */
export const SIG_TOTAL = SIG_GAP + SIG_H; // 38pt
/**
 * Total extra height below box — with signature image (in pt).
 * Layout: equal gap above/below image, then name+pos+date.
 * The whole block is shifted SIG_SHIFT_UP pt upward into the box area.
 */
export const SIG_TOTAL_SIG =
  SIG_GAP + SIG_IMG_H + SIG_GAP + 9 + SIG_LH * 2 - SIG_SHIFT_UP; // 73-30 = 43pt

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class StampCanvasService {
  private readonly logger = new Logger(StampCanvasService.name);
  private fontsReady = false;
  private wordcutReady = false;
  private _measureCtx: SKRSContext2D | null = null;

  // ─── Font init ─────────────────────────────────────────────────────────────

  private ensureFonts() {
    if (this.fontsReady) return;
    try {
      const dir = path.join(__dirname, '..', 'fonts');
      const regular = path.join(dir, 'Sarabun-Regular.ttf');
      const bold    = path.join(dir, 'Sarabun-Bold.ttf');
      if (fs.existsSync(regular)) GlobalFonts.registerFromPath(regular, 'Sarabun');
      if (fs.existsSync(bold))    GlobalFonts.registerFromPath(bold, 'SarabunBold');
      this.fontsReady = true;
    } catch (e) {
      this.logger.warn(`Font registration failed: ${e.message}`);
    }
  }

  // ─── Public: compute stamp content-box heights ─────────────────────────────

  computeEndorsementHeight(data: EndorsementStampData, w: number): number {
    this.ensureFonts();
    const inner = (w - 16) * SCALE;
    const font8 = `${8 * SCALE}px Sarabun`;
    const nOpinion  = data.clerkOpinion ? Math.max(this.lines(font8, data.clerkOpinion, inner, 4).length, 1) : 0;
    const nSummary  = Math.max(this.lines(font8, data.aiSummary, inner, 4).length, 1);
    const nAction   = Math.max(this.lines(font8, data.actionSummary, inner, 4).length, 0);
    const nAssignee = data.assigneeNames?.length ? 1 : 0;
    const opinionH  = nOpinion  ? 11 + nOpinion  * 11 + 6 : 0;
    const assigneeH = nAssignee ? 11 + 11 + 6 : 0;
    return Math.max(14 + opinionH + 11 + nSummary * 11 + 6 + 11 + nAction * 11 + assigneeH + 8, 60);
  }

  computeDirectorNoteHeight(data: DirectorNoteStampData, w: number): number {
    this.ensureFonts();
    const cleaned = data.noteText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const nLines = Math.max(this.lines(`${8 * SCALE}px Sarabun`, cleaned, (w - 16) * SCALE, 6).length, 1);
    return Math.max(12 + 11 + nLines * 11 + 8, 50);
  }

  // ─── Public: render stamps to PNG buffer ───────────────────────────────────

  renderRegistration(data: RegistrationStampData, w: number, h: number): Buffer {
    this.ensureFonts();
    const S = SCALE;
    const canvas = createCanvas(w * S, h * S);
    const ctx = canvas.getContext('2d') as SKRSContext2D;
    ctx.scale(S, S);

    // White fill + blue border
    ctx.beginPath();
    ctx.roundRect(0.75, 0.75, w - 1.5, h - 1.5, 4);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = BLUE;

    const d = toThaiDate(data.registeredAt);

    // Org name: auto-shrink font until fits, centered
    let orgSizePt = 8;
    while (orgSizePt > 6 && this.measurePx(`bold ${orgSizePt * S}px SarabunBold`, data.orgName) > (w - 16) * S) {
      orgSizePt -= 0.5;
    }
    const orgTxt = this.fitSinglePx(`bold ${orgSizePt * S}px SarabunBold`, data.orgName, (w - 16) * S);
    const orgWpt = this.measurePx(`bold ${orgSizePt * S}px SarabunBold`, orgTxt) / S;
    ctx.font = `bold ${orgSizePt}px SarabunBold`;
    ctx.fillText(orgTxt, (w - orgWpt) / 2, 13);

    // Separator line
    ctx.beginPath(); ctx.moveTo(5, 20); ctx.lineTo(w - 5, 20);
    ctx.strokeStyle = BLUE; ctx.lineWidth = 0.5; ctx.stroke();

    // เลขที่รับ
    ctx.font = `bold ${8}px SarabunBold`;
    ctx.fillText('เลขที่รับ', 8, 34);
    ctx.font = `${10}px Sarabun`;
    ctx.fillText(toThaiNumerals(data.registrationNo), 60, 34);

    // วันที่
    ctx.font = `bold ${9}px SarabunBold`;
    ctx.fillText('วันที่', 8, 48);
    ctx.font = `${9}px Sarabun`;
    ctx.fillText(toThaiNumerals(`${d.day} ${d.monthTh} ${d.year}`), 40, 48);

    // เวลา
    ctx.font = `bold ${9}px SarabunBold`;
    ctx.fillText('เวลา', 8, 62);
    ctx.font = `${9}px Sarabun`;
    ctx.fillText(toThaiNumerals(d.time), 40, 62);

    return canvas.toBuffer('image/png');
  }

  async renderEndorsement(data: EndorsementStampData, w: number, h: number): Promise<Buffer> {
    this.ensureFonts();
    const S = SCALE;
    const hasSig = !!data.signatureBuffer;
    const totalH = h + (hasSig ? SIG_TOTAL_SIG : SIG_TOTAL);
    const canvas = createCanvas(w * S, totalH * S);
    const ctx = canvas.getContext('2d') as SKRSContext2D;
    ctx.scale(S, S);
    ctx.clearRect(0, 0, w, totalH);
    ctx.fillStyle = BLUE;

    const innerPx = (w - 16) * S;
    const d = toThaiDate(data.stampedAt);
    // sigTop is shifted SIG_SHIFT_UP pt above the box bottom so signature
    // sits closer to the box text (overlapping the bottom SIG_SHIFT_UP pt of the box area)
    const sigTopOffset = hasSig ? SIG_SHIFT_UP : 0;

    // Row 1: salutation (1 line)
    const salutation = this.lines(`bold ${8 * S}px SarabunBold`, `เรียน ผู้อำนวยการ ${data.schoolName}`, innerPx, 1)[0] ?? '';
    ctx.font = `bold ${8}px SarabunBold`;
    ctx.fillText(salutation, 8, 11);

    let ty = 22;

    // Row 1b: clerk opinion (optional)
    if (data.clerkOpinion) {
      ty += 3;
      ctx.font = `bold ${8}px SarabunBold`;
      ctx.fillText('ความเห็น :', 8, ty);
      ty += 11;
      const opinionLines = this.lines(`${8 * S}px Sarabun`, data.clerkOpinion, innerPx, 4);
      ctx.font = `${8}px Sarabun`;
      for (const line of opinionLines) { ctx.fillText(line, 8, ty); ty += 11; }
      ty += 6;
    }

    // Row 2: AI summary
    const summaryLines = this.lines(`${8 * S}px Sarabun`, data.aiSummary, innerPx, 4);
    ctx.font = `${8}px Sarabun`;
    for (const line of summaryLines) { ctx.fillText(line, 8, ty); ty += 11; }

    // Row 3: action label + lines
    ty += 6;
    ctx.font = `bold ${8}px SarabunBold`;
    ctx.fillText('สิ่งที่ต้องดำเนินการ :', 8, ty);
    ty += 11;
    const actionLines = this.lines(`${8 * S}px Sarabun`, data.actionSummary, innerPx, 4);
    ctx.font = `${8}px Sarabun`;
    for (const line of actionLines) { ctx.fillText(line, 8, ty); ty += 11; }

    // Row 4: assignee names (optional)
    if (data.assigneeNames?.length) {
      ty += 6;
      ctx.font = `bold ${8}px SarabunBold`;
      ctx.fillText('มอบหมาย :', 8, ty);
      ty += 11;
      const namesLine = this.lines(`${8 * S}px Sarabun`, data.assigneeNames.join(', '), innerPx, 2);
      ctx.font = `${8}px Sarabun`;
      for (const line of namesLine) { ctx.fillText(line, 8, ty); ty += 11; }
    }

    // Signature block — shifted SIG_SHIFT_UP pt up into box area (when sig image present)
    const dateStr = `${d.day} ${d.monthTh.slice(0, 3)}. ${d.year}`;
    const sigTop = h + SIG_GAP - sigTopOffset;

    if (hasSig) {
      // Draw signature image right-aligned
      const sigImg = await loadImage(data.signatureBuffer!);
      const maxSigW = w - 16;
      const aspect = sigImg.width / sigImg.height;
      const sigImgW = Math.min(maxSigW, Math.round(SIG_IMG_H * aspect));
      ctx.drawImage(sigImg as any, w - sigImgW - 8, sigTop, sigImgW, SIG_IMG_H);
      // Equal gap above and below image: gap(box→image) = gap(image→name) = SIG_GAP
      const nameY = sigTop + SIG_IMG_H + SIG_GAP + 9;
      ctx.font = `bold ${9}px SarabunBold`;
      this.drawRight(ctx, `bold ${9 * S}px SarabunBold`, data.authorName, w, nameY, S);
      ctx.font = `${8}px Sarabun`;
      if (data.positionTitle) this.drawRight(ctx, `${8 * S}px Sarabun`, data.positionTitle, w, nameY + SIG_LH, S);
      this.drawRight(ctx, `${8 * S}px Sarabun`, dateStr, w, nameY + SIG_LH * 2, S);
    } else {
      ctx.font = `bold ${9}px SarabunBold`;
      this.drawRight(ctx, `bold ${9 * S}px SarabunBold`, data.authorName, w, sigTop + 11, S);
      ctx.font = `${8}px Sarabun`;
      if (data.positionTitle) this.drawRight(ctx, `${8 * S}px Sarabun`, data.positionTitle, w, sigTop + 22, S);
      this.drawRight(ctx, `${8 * S}px Sarabun`, dateStr, w, sigTop + 33, S);
    }

    return canvas.toBuffer('image/png');
  }

  async renderDirectorNote(data: DirectorNoteStampData, w: number, h: number): Promise<Buffer> {
    this.ensureFonts();
    const S = SCALE;
    const hasSig = !!data.signatureBuffer;
    const totalH = h + (hasSig ? SIG_TOTAL_SIG : SIG_TOTAL);
    const canvas = createCanvas(w * S, totalH * S);
    const ctx = canvas.getContext('2d') as SKRSContext2D;
    // ── No ctx.scale(): draw in pixel-space to eliminate CTM measurement drift ──
    ctx.clearRect(0, 0, w * S, totalH * S);
    ctx.fillStyle = BLUE;

    const d = toThaiDate(data.stampedAt);
    const innerPx = (w - 16) * S;

    // Clip text to content box (safety net against overflow)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w * S, h * S);
    ctx.clip();

    // Header "คำสั่ง"
    ctx.font = `bold ${9 * S}px SarabunBold`;
    ctx.fillText('คำสั่ง', 8 * S, 12 * S);

    // Note text — clean newlines, 8pt body, up to 6 lines
    const cleaned = data.noteText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const bodyFont = `${8 * S}px Sarabun`;
    const noteLines = this.lines(bodyFont, cleaned, innerPx, 6);
    ctx.font = bodyFont;
    let tyPx = 23 * S;
    for (const line of noteLines) {
      ctx.fillText(line, 8 * S, tyPx);
      tyPx += 11 * S;
    }

    ctx.restore(); // remove clip

    // ── Signature block — shifted SIG_SHIFT_UP pt up when sig image present ──
    const dateStr = `${d.day} ${d.monthTh.slice(0, 3)}. ${d.year}`;
    const sigShiftPx = hasSig ? SIG_SHIFT_UP * S : 0;
    const sigTopPx = (h + SIG_GAP) * S - sigShiftPx;
    const rightPx = w * S;
    const padPx = 8 * S;

    ctx.fillStyle = BLUE;

    if (hasSig) {
      // Draw signature image right-aligned
      const sigImg = await loadImage(data.signatureBuffer!);
      const maxSigWpx = (w - 16) * S;
      const aspect = sigImg.width / sigImg.height;
      const sigImgHpx = SIG_IMG_H * S;
      const sigImgWpx = Math.min(maxSigWpx, Math.round(sigImgHpx * aspect));
      ctx.drawImage(sigImg as any, rightPx - sigImgWpx - padPx, sigTopPx, sigImgWpx, sigImgHpx);
      // Equal gap above and below image: gap(box→image) = gap(image→name) = SIG_GAP
      const nameYpx = sigTopPx + (SIG_IMG_H + SIG_GAP + 9) * S;
      ctx.font = `bold ${9 * S}px SarabunBold`;
      const nameStr = toThaiNumerals(data.authorName);
      ctx.fillText(nameStr, rightPx - this.measurePx(ctx.font, nameStr) - padPx, nameYpx);
      ctx.font = `${8 * S}px Sarabun`;
      if (data.positionTitle) {
        const posStr = toThaiNumerals(data.positionTitle);
        ctx.fillText(posStr, rightPx - this.measurePx(ctx.font, posStr) - padPx, nameYpx + SIG_LH * S);
      }
      const dateText = toThaiNumerals(dateStr);
      ctx.fillText(dateText, rightPx - this.measurePx(ctx.font, dateText) - padPx, nameYpx + SIG_LH * 2 * S);
    } else {
      ctx.font = `bold ${9 * S}px SarabunBold`;
      const nameStr = toThaiNumerals(data.authorName);
      ctx.fillText(nameStr, rightPx - this.measurePx(ctx.font, nameStr) - padPx, sigTopPx + 11 * S);
      ctx.font = `${8 * S}px Sarabun`;
      if (data.positionTitle) {
        const posStr = toThaiNumerals(data.positionTitle);
        ctx.fillText(posStr, rightPx - this.measurePx(ctx.font, posStr) - padPx, sigTopPx + 22 * S);
      }
      const dateText = toThaiNumerals(dateStr);
      ctx.fillText(dateText, rightPx - this.measurePx(ctx.font, dateText) - padPx, sigTopPx + 33 * S);
    }

    return canvas.toBuffer('image/png');
  }

  // ─── Measurement helpers (always pixel-space, no CTM) ─────────────────────

  /**
   * Measure text width in actual canvas pixels.
   * Uses a 1×1 canvas with no transform so CTM never interferes.
   * @param fontDecl  e.g. '27px Sarabun' or 'bold 27px SarabunBold'
   */
  private measurePx(fontDecl: string, text: string): number {
    const ctx = this.measureCtx();
    ctx.font = fontDecl;
    return ctx.measureText(text).width;
  }

  /**
   * Wrap text into lines, measuring in pixel-space.
   * @param fontDecl  font string with pixel size already multiplied by SCALE
   * @param maxWpx    max width in canvas pixels  (= pt × SCALE)
   */
  private lines(fontDecl: string, text: string, maxWpx: number, maxLines: number): string[] {
    if (!text?.trim()) return [];
    this.ensureWordcut();

    const converted = toThaiNumerals(text);
    let segments: string[];
    try {
      const cut: string = wordcut.cut(converted.normalize('NFC'));
      segments = cut.split('|').filter((s: string) => s.length > 0);
    } catch {
      segments = converted.split(' ');
    }

    const result: string[] = [];
    let cur = '';
    for (const seg of segments) {
      const test = cur + seg;
      if (this.measurePx(fontDecl, test) > maxWpx && cur !== '') {
        result.push(cur);
        if (result.length >= maxLines) { cur = ''; break; }
        cur = seg;
      } else {
        cur = test;
      }
    }
    if (cur && result.length < maxLines) result.push(cur);

    // Truncate any overflow line
    return result.map((line) => {
      if (this.measurePx(fontDecl, line) <= maxWpx) return line;
      let t = line;
      while (t.length > 0 && this.measurePx(fontDecl, t + '…') > maxWpx) t = t.slice(0, -1);
      return t + '…';
    });
  }

  /**
   * Right-align text within stamp width.
   * Measures in pixel-space, converts to pt for drawing.
   * @param fontDecl  full-pixel font string (e.g. '27px Sarabun')
   * @param stampWpt  stamp width in PDF points
   * @param S         SCALE factor
   */
  private drawRight(
    ctx: SKRSContext2D, fontDecl: string, text: string,
    stampWpt: number, y: number, S: number,
  ) {
    const t = toThaiNumerals(text);
    const twPt = this.measurePx(fontDecl, t) / S; // convert px → pt
    ctx.fillText(t, stampWpt - twPt - 8, y);
  }

  /**
   * Truncate text to fit maxWpx (pixel-space), returns the fitted string.
   */
  private fitSinglePx(fontDecl: string, text: string, maxWpx: number): string {
    let t = text;
    while (t.length > 0 && this.measurePx(fontDecl, t) > maxWpx) t = t.slice(0, -1);
    return t;
  }

  private ensureWordcut() {
    if (!this.wordcutReady) { wordcut.init(); this.wordcutReady = true; }
  }

  /** Cached measurement canvas — no transform, sized to hold any expected text */
  private measureCtx(): SKRSContext2D {
    if (!this._measureCtx) {
      this._measureCtx = createCanvas(2000, 60).getContext('2d') as SKRSContext2D;
    }
    return this._measureCtx;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function toThaiNumerals(text: string): string {
  return text.replace(/[0-9]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'[+d]);
}

function toThaiDate(date: Date) {
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
