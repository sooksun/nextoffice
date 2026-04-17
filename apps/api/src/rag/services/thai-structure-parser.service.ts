import { Injectable, Logger } from '@nestjs/common';

/**
 * Hierarchical structure level used in Thai government / legal documents.
 * Ordered from highest (volume) to lowest (item).
 */
export type StructureLevel =
  | 'volume'     // เล่ม / ภาค
  | 'title'      // ลักษณะ
  | 'chapter'    // หมวด
  | 'part'       // ส่วน
  | 'article'    // ข้อ (used in ระเบียบ)
  | 'section'    // มาตรา (used in พ.ร.บ./กฎหมาย)
  | 'paragraph'  // วรรค
  | 'subclause'  // (1), (2), (๑), (๒)
  | 'item';      // ก. ข. ค.

export interface StructuredBlock {
  level: StructureLevel;
  number: string;        // "1", "5/2", "(2)", "ก"
  title?: string;        // heading text following the number
  content: string;       // raw content body (without the heading line)
  breadcrumb: string[];  // e.g. ["หมวด 1 บททั่วไป", "ข้อ 5"]
  startOffset: number;
  endOffset: number;
  pageNumber?: number;   // best-effort if page markers present
}

export interface ThaiDocumentMetadata {
  documentNumber?: string;  // เลขที่หนังสือ e.g. "ศธ 04009/ว123"
  issuedDate?: Date;
  subject?: string;         // เรื่อง
  recipient?: string;       // เรียน
  issuer?: string;          // หน่วยงาน (best-effort)
}

export interface ParsedThaiDocument {
  metadata: ThaiDocumentMetadata;
  blocks: StructuredBlock[];  // flat list in document order, each carrying breadcrumb
  hasStructure: boolean;       // false when no recognizable markers found
}

interface Marker {
  level: StructureLevel;
  number: string;
  title: string;
  lineIndex: number;
  offset: number;
}

/**
 * Parse Thai government / legal documents into hierarchical blocks with
 * breadcrumb paths. Can be used stand-alone (no DI deps) — instantiate
 * with `new ThaiStructureParserService()` from scripts.
 */
@Injectable()
export class ThaiStructureParserService {
  private readonly logger = new Logger(ThaiStructureParserService.name);

  // Ordered by structural rank (volume broadest → item narrowest).
  // The first pattern that matches a line wins, so volume/title/chapter
  // must come before article/section.
  private readonly patterns: Array<{ level: StructureLevel; pattern: RegExp }> = [
    { level: 'volume',    pattern: /^(?:เล่ม|ภาค)\s+(?:ที่\s+)?([๐-๙\d]+|[ก-ฮ])\s*(.*)$/ },
    { level: 'title',     pattern: /^ลักษณะ\s+(?:ที่\s+)?([๐-๙\d]+)\s*(.*)$/ },
    { level: 'chapter',   pattern: /^หมวด\s+([๐-๙\d]+)\s*(.*)$/ },
    { level: 'part',      pattern: /^ส่วน(?:ที่)?\s+([๐-๙\d]+)\s*(.*)$/ },
    { level: 'article',   pattern: /^ข้อ\s+([๐-๙\d]+(?:\/[๐-๙\d]+)?)\s+(.*)$/ },
    { level: 'section',   pattern: /^มาตรา\s+([๐-๙\d]+(?:\/[๐-๙\d]+)?(?:\s*(?:ทวิ|ตรี|จัตวา))?)\s+(.*)$/ },
    { level: 'paragraph', pattern: /^วรรค(หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|[๐-๙\d]+)\s*(.*)$/ },
    { level: 'subclause', pattern: /^\(([๐-๙\d]+|[ก-ฮ])\)\s+(.*)$/ },
    { level: 'item',      pattern: /^([ก-ฮ])[\.\s]\s*(.+)$/ },
  ];

  parse(rawText: string): ParsedThaiDocument {
    const cleaned = this.normalize(rawText);
    const metadata = this.extractMetadata(cleaned);
    const body = this.stripHeader(cleaned);

    const lines = body.split('\n');
    const markers = this.detectMarkers(lines);

    if (markers.length === 0) {
      return { metadata, blocks: [], hasStructure: false };
    }

    const blocks = this.buildBlocks(lines, markers);
    return { metadata, blocks, hasStructure: true };
  }

  // ═══════════════════════════════════════════════════════════════
  //   Normalization
  // ═══════════════════════════════════════════════════════════════
  normalize(text: string): string {
    let t = text.normalize('NFC');

    // zero-width / soft-hyphen / nbsp
    t = t.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '').replace(/\u00A0/g, ' ');

    // normalize curly quotes / dashes
    t = t
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-');

    // collapse whitespace but keep paragraph breaks
    t = t
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n');

    // remove repeated page header/footer lines (appearing 3+ times)
    t = this.stripRepeatedLines(t);

    return t.trim();
  }

  private stripRepeatedLines(text: string): string {
    const lines = text.split('\n');
    const count = new Map<string, number>();
    for (const raw of lines) {
      const s = raw.trim();
      if (s.length > 0 && s.length < 100) {
        count.set(s, (count.get(s) ?? 0) + 1);
      }
    }
    const drop = new Set<string>();
    for (const [line, n] of count) {
      if (n >= 3 && this.looksLikeHeaderFooter(line)) drop.add(line);
    }
    return lines.filter((l) => !drop.has(l.trim())).join('\n');
  }

  private looksLikeHeaderFooter(line: string): boolean {
    if (/^-?\s*[๐-๙\d]+\s*-?$/.test(line)) return true;
    if (/^หน้า\s+[๐-๙\d]+/.test(line)) return true;
    if (/^[๐-๙\d]+\/[๐-๙\d]+$/.test(line)) return true;
    if (/^https?:\/\//.test(line)) return true;
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  //   Metadata extraction
  // ═══════════════════════════════════════════════════════════════
  extractMetadata(text: string): ThaiDocumentMetadata {
    const meta: ThaiDocumentMetadata = {};

    // เลขที่หนังสือ: "ที่ ศธ 04009/ว 123" or "ที่ ๐๔๐๐๙/ว๑๒๓"
    const docNum = text.match(/ที่\s+([ก-ฮ]{0,4}\s*[๐-๙\d]+(?:[\/\.][วพร]?\s*[๐-๙\d]+)+)/);
    if (docNum) meta.documentNumber = docNum[1].trim().replace(/\s+/g, ' ');

    // วันที่
    const dateMatch = text.match(
      /([๐-๙\d]{1,2})\s+(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+(?:พ\.ศ\.\s*)?([๐-๙\d]{4})/,
    );
    if (dateMatch) {
      const d = this.parseThaiDate(dateMatch[0]);
      if (d) meta.issuedDate = d;
    }

    const subject = text.match(/(?:^|\n)\s*เรื่อง\s+(.+?)(?:\n|$)/);
    if (subject) meta.subject = subject[1].trim();

    const to = text.match(/(?:^|\n)\s*เรียน\s+(.+?)(?:\n|$)/);
    if (to) meta.recipient = to[1].trim();

    return meta;
  }

  private parseThaiDate(s: string): Date | undefined {
    const months: Record<string, number> = {
      มกราคม: 0, กุมภาพันธ์: 1, มีนาคม: 2, เมษายน: 3,
      พฤษภาคม: 4, มิถุนายน: 5, กรกฎาคม: 6, สิงหาคม: 7,
      กันยายน: 8, ตุลาคม: 9, พฤศจิกายน: 10, ธันวาคม: 11,
    };
    const m = s.match(/([๐-๙\d]+)\s+(\S+)\s+(?:พ\.ศ\.\s*)?([๐-๙\d]+)/);
    if (!m) return undefined;
    const day = parseInt(this.toArabic(m[1]), 10);
    const month = months[m[2]];
    let year = parseInt(this.toArabic(m[3]), 10);
    if (Number.isNaN(day) || month === undefined || Number.isNaN(year)) return undefined;
    if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
    const d = new Date(Date.UTC(year, month, day));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  private stripHeader(text: string): string {
    // Cut header off before the first body marker (หมวด/ข้อ/มาตรา/ภาค/ลักษณะ)
    const idx = text.search(/(?:^|\n)\s*(?:หมวด|ข้อ|มาตรา|ภาค|ลักษณะ)\s+[๐-๙\d]/);
    if (idx > 0) return text.slice(idx).replace(/^\s+/, '');
    return text;
  }

  // ═══════════════════════════════════════════════════════════════
  //   Marker detection
  // ═══════════════════════════════════════════════════════════════
  private detectMarkers(lines: string[]): Marker[] {
    const markers: Marker[] = [];
    let offset = 0;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (line) {
        for (const { level, pattern } of this.patterns) {
          const m = line.match(pattern);
          if (m) {
            markers.push({
              level,
              number: this.toArabic(m[1] ?? ''),
              title: (m[2] ?? '').trim(),
              lineIndex: i,
              offset,
            });
            break; // highest-priority match wins
          }
        }
      }
      offset += raw.length + 1; // +1 for '\n'
    }

    return markers;
  }

  // ═══════════════════════════════════════════════════════════════
  //   Block building — flat list with breadcrumb path
  // ═══════════════════════════════════════════════════════════════
  private buildBlocks(lines: string[], markers: Marker[]): StructuredBlock[] {
    const blocks: StructuredBlock[] = [];
    const stack: Marker[] = [];

    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const nextLine = i + 1 < markers.length ? markers[i + 1].lineIndex : lines.length;

      // Maintain hierarchy stack: pop anything at-or-below current level
      while (stack.length > 0 && this.levelRank(stack[stack.length - 1].level) >= this.levelRank(m.level)) {
        stack.pop();
      }

      const breadcrumb = [...stack, m].map((x) => this.formatLabel(x.level, x.number, x.title));

      const content = lines
        .slice(m.lineIndex + 1, nextLine)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join('\n');

      const endOffset = nextLine < lines.length
        ? markers[i + 1].offset
        : m.offset + content.length;

      blocks.push({
        level: m.level,
        number: m.number,
        title: m.title || undefined,
        content,
        breadcrumb,
        startOffset: m.offset,
        endOffset,
      });

      stack.push(m);
    }

    return blocks;
  }

  private levelRank(level: StructureLevel): number {
    const order: StructureLevel[] = [
      'volume', 'title', 'chapter', 'part',
      'article', 'section', 'paragraph', 'subclause', 'item',
    ];
    return order.indexOf(level);
  }

  private formatLabel(level: StructureLevel, number: string, title: string): string {
    const prefix: Record<StructureLevel, string> = {
      volume: 'เล่ม',
      title: 'ลักษณะ',
      chapter: 'หมวด',
      part: 'ส่วน',
      article: 'ข้อ',
      section: 'มาตรา',
      paragraph: 'วรรค',
      subclause: `(${number})`,
      item: `${number}.`,
    };
    const base =
      level === 'subclause' || level === 'item'
        ? prefix[level]
        : `${prefix[level]} ${number}`;
    return title ? `${base} ${title}` : base;
  }

  private toArabic(s: string): string {
    return s.replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d).toString());
  }
}
