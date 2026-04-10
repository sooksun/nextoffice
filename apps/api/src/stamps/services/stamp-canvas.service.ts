import { Injectable, Logger } from '@nestjs/common';
import { createCanvas, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';
import * as path from 'path';
import * as fs from 'fs';
import * as wordcut from 'wordcut';
import { EndorsementStampData, DirectorNoteStampData } from './pdf-stamp.service';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Pixel-per-point ratio: render at 3× for crisp PDF output */
const SCALE = 3;

/** Stamp blue colour */
const BLUE = 'rgb(18, 84, 177)'; // ≈ rgb(0.07, 0.33, 0.71)

/** Vertical padding below stamp box before signature block starts */
const SIG_GAP = 4;
/** Signature block height: name + position + date */
const SIG_H = 34;
/** Total extra height below box for signature */
export const SIG_TOTAL = SIG_GAP + SIG_H; // 38pt

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class StampCanvasService {
  private readonly logger = new Logger(StampCanvasService.name);
  private fontsReady = false;
  private wordcutReady = false;

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

  /**
   * Compute height of stamp #2 content box (not including signature below).
   * Uses a temporary canvas for accurate Thai text measurement.
   */
  computeEndorsementHeight(data: EndorsementStampData, w: number): number {
    this.ensureFonts();
    const inner = (w - 16) * SCALE;
    const mCtx = this.measureCtx();

    mCtx.font = `${8 * SCALE}px Sarabun`;
    const nSummary = Math.max(this.wrapText(mCtx, data.aiSummary,    inner, 4).length, 1);
    const nAction  = Math.max(this.wrapText(mCtx, data.actionSummary, inner, 4).length, 0);

    // 14 (salutation) + 11 (gap) + nSummary×11 + 6 (gap) + 11 (action label) + nAction×11 + 8 (bottom)
    return Math.max(14 + 11 + nSummary * 11 + 6 + 11 + nAction * 11 + 8, 60);
  }

  /**
   * Compute height of stamp #3 content box.
   */
  computeDirectorNoteHeight(data: DirectorNoteStampData, w: number): number {
    this.ensureFonts();
    const mCtx = this.measureCtx();
    mCtx.font = `${9 * SCALE}px Sarabun`;
    const nLines = Math.max(this.wrapText(mCtx, data.noteText, (w - 16) * SCALE, 3).length, 1);

    // 16 (header) + 14 (gap) + nLines×14 + 8 (bottom)
    return Math.max(16 + 14 + nLines * 14 + 8, 50);
  }

  // ─── Public: render stamps to PNG buffer ───────────────────────────────────

  /**
   * Render stamp #2 (endorsement) as a PNG buffer.
   * Canvas includes content box + signature block below.
   * @param w  stamp width in PDF points
   * @param h  stamp content-box height in PDF points (from computeEndorsementHeight)
   */
  renderEndorsement(data: EndorsementStampData, w: number, h: number): Buffer {
    this.ensureFonts();
    const S = SCALE;
    const totalH = h + SIG_TOTAL;
    const canvas = createCanvas(w * S, totalH * S);
    const ctx = canvas.getContext('2d') as SKRSContext2D;

    ctx.scale(S, S);
    ctx.clearRect(0, 0, w, totalH);
    ctx.fillStyle = BLUE;

    const inner = w - 16;
    const d = toThaiDate(data.stampedAt);

    // Row 1: salutation
    ctx.font = `bold ${8}px SarabunBold`;
    const salutation = this.wrapText(ctx, `เรียน ผู้อำนวยการโรงเรียน ${data.schoolName}`, inner, 1)[0] ?? '';
    ctx.fillText(salutation, 8, 11);

    // Row 2: AI summary
    ctx.font = `${8}px Sarabun`;
    const summaryLines = this.wrapText(ctx, data.aiSummary, inner, 4);
    let ty = 22;
    for (const line of summaryLines) { ctx.fillText(line, 8, ty); ty += 11; }

    // Row 3: action label + lines
    ty += 6;
    ctx.font = `bold ${8}px SarabunBold`;
    ctx.fillText('สิ่งที่ต้องดำเนินการ :', 8, ty);
    ty += 11;
    ctx.font = `${8}px Sarabun`;
    const actionLines = this.wrapText(ctx, data.actionSummary, inner, 4);
    for (const line of actionLines) { ctx.fillText(line, 8, ty); ty += 11; }

    // Signature block — below content box
    const dateStr = `${d.day} ${d.monthTh.slice(0, 3)}. ${d.year}`;
    const sigTop = h + SIG_GAP;
    ctx.font = `bold ${9}px SarabunBold`;
    this.drawRight(ctx, data.authorName, w, sigTop + 11);
    ctx.font = `${8}px Sarabun`;
    if (data.positionTitle) this.drawRight(ctx, data.positionTitle, w, sigTop + 22);
    this.drawRight(ctx, dateStr, w, sigTop + 33);

    return canvas.toBuffer('image/png');
  }

  /**
   * Render stamp #3 (director note) as a PNG buffer.
   */
  renderDirectorNote(data: DirectorNoteStampData, w: number, h: number): Buffer {
    this.ensureFonts();
    const S = SCALE;
    const totalH = h + SIG_TOTAL;
    const canvas = createCanvas(w * S, totalH * S);
    const ctx = canvas.getContext('2d') as SKRSContext2D;

    ctx.scale(S, S);
    ctx.clearRect(0, 0, w, totalH);
    ctx.fillStyle = BLUE;

    const d = toThaiDate(data.stampedAt);

    // Header "คำสั่ง"
    ctx.font = `bold ${9}px SarabunBold`;
    ctx.fillText('คำสั่ง', 8, 13);

    // Note text
    ctx.font = `${9}px Sarabun`;
    const lines = this.wrapText(ctx, data.noteText, w - 16, 3);
    let ty = 27;
    for (const line of lines) { ctx.fillText(line, 8, ty); ty += 14; }

    // Signature block — below content box
    const dateStr = `${d.day} ${d.monthTh.slice(0, 3)}. ${d.year}`;
    const sigTop = h + SIG_GAP;
    ctx.font = `bold ${9}px SarabunBold`;
    this.drawRight(ctx, data.authorName, w, sigTop + 11);
    ctx.font = `${8}px Sarabun`;
    if (data.positionTitle) this.drawRight(ctx, data.positionTitle, w, sigTop + 22);
    this.drawRight(ctx, dateStr, w, sigTop + 33);

    return canvas.toBuffer('image/png');
  }

  // ─── Thai-aware word wrap (uses ctx.measureText — Skia handles shaping) ────

  private ensureWordcut() {
    if (!this.wordcutReady) {
      wordcut.init();
      this.wordcutReady = true;
    }
  }

  private wrapText(
    ctx: SKRSContext2D,
    text: string,
    maxW: number,
    maxLines: number,
  ): string[] {
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

    const lines: string[] = [];
    let cur = '';
    for (const seg of segments) {
      const test = cur + seg;
      if (ctx.measureText(test).width > maxW && cur !== '') {
        lines.push(cur);
        if (lines.length >= maxLines) { cur = ''; break; }
        cur = seg;
      } else {
        cur = test;
      }
    }
    if (cur && lines.length < maxLines) lines.push(cur);

    // Truncate any line that still overflows
    return lines.map((line) => {
      if (ctx.measureText(line).width <= maxW) return line;
      let t = line;
      while (t.length > 0 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      return t + '…';
    });
  }

  /** Right-align text within stamp width */
  private drawRight(ctx: SKRSContext2D, text: string, stampW: number, y: number) {
    const t = toThaiNumerals(text);
    const tw = ctx.measureText(t).width;
    ctx.fillText(t, stampW - tw - 8, y);
  }

  /** Temporary 1px canvas just for text measurement */
  private measureCtx(): SKRSContext2D {
    return createCanvas(1, 1).getContext('2d') as SKRSContext2D;
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
  };
}
