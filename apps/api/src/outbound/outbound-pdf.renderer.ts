import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as fontkit from '@pdf-lib/fontkit';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import type { OutboundPerson, OutboundRenderModel } from './outbound-render.model';

type OutboundPdfContext = {
  pdfDoc: PDFDocument;
  page: PDFPage;
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
  };
  y: number;
  pageWidth: number;
  pageHeight: number;
  marginX: number;
  marginBottom: number;
};

/**
 * pdf-lib layout for official Thai outbound letters.
 * Kept out of OutboundService so domain orchestration stays thin.
 */
@Injectable()
export class OutboundPdfRenderer {
  private readonly logger = new Logger(OutboundPdfRenderer.name);

  async render(model: OutboundRenderModel): Promise<Buffer> {
    const ctx = await this.createContext();
    const org = model.org;
    const { dateStr, letterType, documentNo, subjectDisplay: subject, body, signer } = model;
    const recipient = model.recipientDisplay;
    const recipientStamp = model.recipientStamp ?? recipient;

    switch (letterType) {
      case 'internal_memo':
        this.drawLine(ctx, 'บันทึกข้อความ', {
          size: 24,
          font: ctx.fonts.bold,
          align: 'center',
          lineHeight: 34,
        });
        ctx.y -= 8;
        this.drawLine(ctx, `ส่วนราชการ ${org?.name ?? '-'}`, { font: ctx.fonts.bold });
        this.drawTwoColumnLine(ctx, `ที่ ${documentNo ?? '-'}`, `วันที่ ${dateStr}`);
        this.drawLine(ctx, `เรื่อง ${subject}`, { font: ctx.fonts.bold });
        this.drawLine(ctx, `เรียน ${recipient}`);
        this.drawSeparator(ctx);
        this.drawParagraph(ctx, body, { indent: 28 });
        this.drawSignature(ctx, signer);
        break;

      case 'stamp_letter':
        await this.drawGaruda(ctx);
        this.drawTwoColumnLine(ctx, `ที่ ${documentNo ?? '-'}`, dateStr);
        ctx.y -= 8;
        this.drawLine(ctx, `ถึง ${recipientStamp}`, { font: ctx.fonts.bold });
        this.drawParagraph(ctx, body, { indent: 28 });
        this.drawSignature(ctx, signer);
        break;

      case 'order':
      case 'directive':
        await this.drawGaruda(ctx);
        this.drawLine(ctx, `คำสั่ง${org?.name ? ` ${org.name}` : ''}`, {
          size: 18,
          font: ctx.fonts.bold,
          align: 'center',
          lineHeight: 28,
        });
        this.drawLine(ctx, `ที่ ${documentNo ?? '-'}`, { align: 'center' });
        this.drawLine(ctx, `เรื่อง ${subject}`, { font: ctx.fonts.bold, align: 'center' });
        this.drawSeparator(ctx);
        this.drawParagraph(ctx, body, { indent: 28 });
        this.drawLine(ctx, `สั่ง ณ วันที่ ${dateStr}`, { align: 'center' });
        this.drawSignature(ctx, signer);
        break;

      case 'announcement':
        await this.drawGaruda(ctx);
        this.drawLine(ctx, `ประกาศ${org?.name ? ` ${org.name}` : ''}`, {
          size: 18,
          font: ctx.fonts.bold,
          align: 'center',
          lineHeight: 28,
        });
        this.drawLine(ctx, `เรื่อง ${subject}`, { font: ctx.fonts.bold, align: 'center' });
        this.drawSeparator(ctx);
        this.drawParagraph(ctx, body, { indent: 28 });
        this.drawLine(ctx, `ประกาศ ณ วันที่ ${dateStr}`, { align: 'center' });
        this.drawSignature(ctx, signer);
        break;

      default:
        await this.drawGaruda(ctx);
        if (org?.name) this.drawLine(ctx, org.name, { size: 16, font: ctx.fonts.bold, align: 'center' });
        if (org?.address) this.drawLine(ctx, org.address, { size: 13, align: 'center' });
        ctx.y -= 10;
        this.drawTwoColumnLine(ctx, `ที่ ${documentNo ?? '-'}`, dateStr);
        this.drawLine(ctx, `เรื่อง ${subject}`, { font: ctx.fonts.bold });
        this.drawLine(ctx, `เรียน ${recipient}`);
        this.drawSeparator(ctx);
        this.drawParagraph(ctx, body, { indent: 28 });
        this.drawLine(ctx, 'ขอแสดงความนับถือ', { x: ctx.pageWidth - 190, align: 'center' });
        this.drawSignature(ctx, signer);
        if (org?.name || org?.phone) {
          ctx.y -= 14;
          if (org?.name) this.drawLine(ctx, org.name, { size: 12, lineHeight: 18 });
          if (org?.phone) this.drawLine(ctx, `โทร. ${org.phone}`, { size: 12, lineHeight: 18 });
        }
        break;
    }

    return Buffer.from(await ctx.pdfDoc.save());
  }

  private async createContext(): Promise<OutboundPdfContext> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const regularBytes = this.readAsset('Sarabun-Regular.ttf');
    const boldBytes = this.readAsset('Sarabun-Bold.ttf');
    if (!regularBytes || !boldBytes) {
      throw new ServiceUnavailableException(
        'ไม่พบฟอนต์ Sarabun สำหรับสร้าง PDF หนังสือส่งออก (stamps/fonts/Sarabun-*.ttf)',
      );
    }

    const regular = await pdfDoc.embedFont(regularBytes, { subset: true });
    const bold = await pdfDoc.embedFont(boldBytes, { subset: true });
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    return {
      pdfDoc,
      page,
      fonts: { regular, bold },
      y: pageHeight - 58,
      pageWidth,
      pageHeight,
      marginX: 72,
      marginBottom: 58,
    };
  }

  private readAsset(fileName: string): Buffer | null {
    // Canonical: nest assets copy stamps/fonts next to compiled stamps module
    const candidates = [
      join(__dirname, '..', 'stamps', 'fonts', fileName),
      join(process.cwd(), 'src', 'stamps', 'fonts', fileName),
      join(process.cwd(), 'apps', 'api', 'src', 'stamps', 'fonts', fileName),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return readFileSync(candidate);
    }
    return null;
  }

  private async drawGaruda(ctx: OutboundPdfContext): Promise<void> {
    const imageBytes = this.readAsset('kruth02.png');
    if (!imageBytes) {
      ctx.y -= 10;
      return;
    }

    try {
      const image: PDFImage = await ctx.pdfDoc.embedPng(imageBytes);
      const width = 48;
      const height = (image.height / image.width) * width;
      ctx.page.drawImage(image, {
        x: ctx.pageWidth / 2 - width / 2,
        y: ctx.y - height,
        width,
        height,
      });
      ctx.y -= height + 16;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Outbound PDF garuda asset could not be embedded: ${msg}`);
      ctx.y -= 10;
    }
  }

  private drawTwoColumnLine(ctx: OutboundPdfContext, left: string, right: string): void {
    this.ensureSpace(ctx, 24);
    this.drawText(ctx, left, ctx.marginX, ctx.y, 14, ctx.fonts.regular);
    this.drawText(ctx, right, ctx.pageWidth - ctx.marginX, ctx.y, 14, ctx.fonts.regular, 'right');
    ctx.y -= 24;
  }

  private drawLine(
    ctx: OutboundPdfContext,
    text: string,
    options: {
      size?: number;
      font?: PDFFont;
      x?: number;
      align?: 'left' | 'center' | 'right';
      lineHeight?: number;
    } = {},
  ): void {
    const size = options.size ?? 14;
    const font = options.font ?? ctx.fonts.regular;
    const lineHeight = options.lineHeight ?? 22;
    const align = options.align ?? 'left';
    const x = options.x ?? (align === 'center' ? ctx.pageWidth / 2 : ctx.marginX);

    this.ensureSpace(ctx, lineHeight);
    this.drawText(ctx, text, x, ctx.y, size, font, align);
    ctx.y -= lineHeight;
  }

  private drawParagraph(
    ctx: OutboundPdfContext,
    text: string,
    options: { size?: number; font?: PDFFont; indent?: number; paragraphGap?: number } = {},
  ): void {
    const size = options.size ?? 14;
    const font = options.font ?? ctx.fonts.regular;
    const indent = options.indent ?? 0;
    const paragraphGap = options.paragraphGap ?? 8;
    const maxWidth = ctx.pageWidth - ctx.marginX * 2 - indent;
    const normalized = this.normalizeText(text || '-');
    const paragraphs = normalized
      .split(/\n+/)
      .map((p) => p.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean);

    for (const paragraph of paragraphs.length ? paragraphs : ['-']) {
      const lines = this.wrapText(paragraph, font, size, maxWidth);
      for (const line of lines) {
        this.drawLine(ctx, line, {
          size,
          font,
          x: ctx.marginX + indent,
          lineHeight: 22,
        });
      }
      ctx.y -= paragraphGap;
    }
  }

  private drawSignature(ctx: OutboundPdfContext, signer: OutboundPerson | null): void {
    const centerX = ctx.pageWidth - 190;
    ctx.y -= 28;
    this.drawLine(ctx, '(ลงชื่อ)........................................', { x: centerX, align: 'center' });
    this.drawLine(ctx, `(${signer?.fullName ?? ''})`, { x: centerX, align: 'center' });
    if (signer?.positionTitle) {
      this.drawLine(ctx, signer.positionTitle, { x: centerX, align: 'center', lineHeight: 20 });
    }
  }

  private drawSeparator(ctx: OutboundPdfContext): void {
    this.ensureSpace(ctx, 18);
    ctx.page.drawLine({
      start: { x: ctx.marginX, y: ctx.y },
      end: { x: ctx.pageWidth - ctx.marginX, y: ctx.y },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
    ctx.y -= 18;
  }

  private drawText(
    ctx: OutboundPdfContext,
    value: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont,
    align: 'left' | 'center' | 'right' = 'left',
  ): void {
    const text = this.normalizeText(value).replace(/\s+/g, ' ').trim();
    const width = font.widthOfTextAtSize(text, size);
    const drawX = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    ctx.page.drawText(text, { x: drawX, y, size, font, color: rgb(0, 0, 0) });
  }

  private ensureSpace(ctx: OutboundPdfContext, needed: number): void {
    if (ctx.y >= ctx.marginBottom + needed) return;
    ctx.page = ctx.pdfDoc.addPage([ctx.pageWidth, ctx.pageHeight]);
    ctx.y = ctx.pageHeight - 58;
  }

  private wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    let current = '';

    for (const char of Array.from(text)) {
      const candidate = current + char;
      if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(current.trimEnd());
        current = char.trimStart();
      } else {
        current = candidate;
      }
    }

    if (current.trim()) lines.push(current.trimEnd());
    return lines.length ? lines : [''];
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '')
      .replace(/\u0000/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }
}
