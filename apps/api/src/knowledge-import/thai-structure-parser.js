/**
 * Thai Structure Parser — pure JS port of ThaiStructureParserService.
 *
 * ZERO npm dependencies — uses only Node.js built-ins.
 * Runs inside the knowledge-worker child process (memory-sensitive).
 *
 * Mirrors apps/api/src/rag/services/thai-structure-parser.service.ts
 * so regex/rules stay in sync between chat RAG and knowledge import.
 *
 * Exports:
 *   parseThaiDocument(text)       → { metadata, blocks, hasStructure }
 *   splitStructured(text, title?) → StructuredChunk[]
 *   splitFlat(text)               → string[]  (legacy API)
 */

'use strict';

const CHUNK_TARGET_CHARS = 1200; // ≈ 800 tokens
const OVERLAP_CHARS = 150;
const MIN_CHUNK_CHARS = 10;

// Ordered by structural rank: first match wins per line.
const STRUCTURE_PATTERNS = [
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

const LEVEL_ORDER = [
  'volume', 'title', 'chapter', 'part',
  'article', 'section', 'paragraph', 'subclause', 'item',
];

const THAI_MONTHS = {
  'มกราคม': 0, 'กุมภาพันธ์': 1, 'มีนาคม': 2, 'เมษายน': 3,
  'พฤษภาคม': 4, 'มิถุนายน': 5, 'กรกฎาคม': 6, 'สิงหาคม': 7,
  'กันยายน': 8, 'ตุลาคม': 9, 'พฤศจิกายน': 10, 'ธันวาคม': 11,
};

// ── Public API ───────────────────────────────────────────────────────────────
module.exports = {
  parseThaiDocument,
  splitStructured,
  splitFlat,
};

// ── Normalization ────────────────────────────────────────────────────────────
function normalize(text) {
  let t = text.normalize('NFC');
  t = t.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '').replace(/\u00A0/g, ' ');
  t = t
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-');
  t = t
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  t = stripRepeatedLines(t);
  return t.trim();
}

function stripRepeatedLines(text) {
  const lines = text.split('\n');
  const count = new Map();
  for (const raw of lines) {
    const s = raw.trim();
    if (s.length > 0 && s.length < 100) {
      count.set(s, (count.get(s) || 0) + 1);
    }
  }
  const drop = new Set();
  for (const [line, n] of count) {
    if (n >= 3 && looksLikeHeaderFooter(line)) drop.add(line);
  }
  return lines.filter((l) => !drop.has(l.trim())).join('\n');
}

function looksLikeHeaderFooter(line) {
  if (/^-?\s*[๐-๙\d]+\s*-?$/.test(line)) return true;
  if (/^หน้า\s+[๐-๙\d]+/.test(line)) return true;
  if (/^[๐-๙\d]+\/[๐-๙\d]+$/.test(line)) return true;
  if (/^https?:\/\//.test(line)) return true;
  return false;
}

// ── Metadata extraction ──────────────────────────────────────────────────────
function extractMetadata(text) {
  const meta = {};
  const docNum = text.match(/ที่\s+([ก-ฮ]{0,4}\s*[๐-๙\d]+(?:[\/\.][วพร]?\s*[๐-๙\d]+)+)/);
  if (docNum) meta.documentNumber = docNum[1].trim().replace(/\s+/g, ' ');

  const dateMatch = text.match(
    /([๐-๙\d]{1,2})\s+(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+(?:พ\.ศ\.\s*)?([๐-๙\d]{4})/,
  );
  if (dateMatch) {
    const d = parseThaiDate(dateMatch[0]);
    if (d) meta.issuedDate = d;
  }

  const subject = text.match(/(?:^|\n)\s*เรื่อง\s+(.+?)(?:\n|$)/);
  if (subject) meta.subject = subject[1].trim();

  const to = text.match(/(?:^|\n)\s*เรียน\s+(.+?)(?:\n|$)/);
  if (to) meta.recipient = to[1].trim();

  return meta;
}

function parseThaiDate(s) {
  const m = s.match(/([๐-๙\d]+)\s+(\S+)\s+(?:พ\.ศ\.\s*)?([๐-๙\d]+)/);
  if (!m) return undefined;
  const day = parseInt(toArabic(m[1]), 10);
  const month = THAI_MONTHS[m[2]];
  let year = parseInt(toArabic(m[3]), 10);
  if (Number.isNaN(day) || month === undefined || Number.isNaN(year)) return undefined;
  if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
  const d = new Date(Date.UTC(year, month, day));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function stripHeader(text) {
  const idx = text.search(/(?:^|\n)\s*(?:หมวด|ข้อ|มาตรา|ภาค|ลักษณะ)\s+[๐-๙\d]/);
  if (idx > 0) return text.slice(idx).replace(/^\s+/, '');
  return text;
}

// ── Marker detection ─────────────────────────────────────────────────────────
function detectMarkers(lines) {
  const markers = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line) {
      for (const { level, pattern } of STRUCTURE_PATTERNS) {
        const m = line.match(pattern);
        if (m) {
          markers.push({
            level,
            number: toArabic(m[1] || ''),
            title: (m[2] || '').trim(),
            lineIndex: i,
            offset,
          });
          break;
        }
      }
    }
    offset += raw.length + 1;
  }
  return markers;
}

// ── Block building ───────────────────────────────────────────────────────────
function buildBlocks(lines, markers) {
  const blocks = [];
  const stack = [];
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const nextLine = i + 1 < markers.length ? markers[i + 1].lineIndex : lines.length;

    while (stack.length > 0 && levelRank(stack[stack.length - 1].level) >= levelRank(m.level)) {
      stack.pop();
    }

    const breadcrumb = [...stack, m].map((x) => formatLabel(x.level, x.number, x.title));

    const content = lines
      .slice(m.lineIndex + 1, nextLine)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join('\n');

    blocks.push({
      level: m.level,
      number: m.number,
      title: m.title || undefined,
      content,
      breadcrumb,
    });
    stack.push(m);
  }
  return blocks;
}

function levelRank(level) {
  return LEVEL_ORDER.indexOf(level);
}

function formatLabel(level, number, title) {
  const prefixMap = {
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
      ? prefixMap[level]
      : `${prefixMap[level]} ${number}`;
  return title ? `${base} ${title}` : base;
}

function toArabic(s) {
  return s.replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d).toString());
}

// ── Main entry ───────────────────────────────────────────────────────────────
function parseThaiDocument(rawText) {
  const cleaned = normalize(rawText);
  const metadata = extractMetadata(cleaned);
  const body = stripHeader(cleaned);
  const lines = body.split('\n');
  const markers = detectMarkers(lines);

  if (markers.length === 0) {
    return { metadata, blocks: [], hasStructure: false };
  }
  const blocks = buildBlocks(lines, markers);
  return { metadata, blocks, hasStructure: true };
}

// ── Structure-aware chunking ─────────────────────────────────────────────────
/**
 * Splits text into structured chunks. Each chunk carries its breadcrumb path
 * so retrieval-time context is preserved.
 *
 * Returns: Array<{ text, sectionTitle?, semanticLabel?, breadcrumb?, rawContent }>
 */
function splitStructured(text, documentTitle) {
  const parsed = parseThaiDocument(text);

  if (!parsed.hasStructure || parsed.blocks.length === 0) {
    return splitFlat(text).map((piece) => ({
      text: documentTitle ? `[${documentTitle}]\n\n${piece}` : piece,
      rawContent: piece,
    }));
  }

  const chunks = [];
  for (const block of parsed.blocks) {
    const header = block.breadcrumb[block.breadcrumb.length - 1] || '';
    const body = [header, block.content].filter(Boolean).join('\n');
    if (body.trim().length < MIN_CHUNK_CHARS) continue;

    const prefix = buildPrefix(block.breadcrumb, documentTitle);

    if (body.length <= CHUNK_TARGET_CHARS) {
      chunks.push(makeChunk(prefix, body, block));
    } else {
      for (const piece of splitLongText(body)) {
        chunks.push(makeChunk(prefix, piece, block));
      }
    }
  }
  return mergeSmallChunks(chunks);
}

function buildPrefix(breadcrumb, documentTitle) {
  const parts = documentTitle ? [documentTitle, ...breadcrumb] : breadcrumb;
  return parts.length > 0 ? `[${parts.join(' > ')}]` : '';
}

function makeChunk(prefix, body, block) {
  const text = prefix ? `${prefix}\n\n${body}` : body;
  const sectionTitle = block.breadcrumb[block.breadcrumb.length - 1];
  return {
    text,
    rawContent: body,
    sectionTitle: sectionTitle ? sectionTitle.slice(0, 255) : undefined,
    semanticLabel: block.level,
    breadcrumb: block.breadcrumb,
  };
}

function mergeSmallChunks(chunks) {
  const threshold = CHUNK_TARGET_CHARS * 0.25;
  const out = [];
  for (const c of chunks) {
    const prev = out[out.length - 1];
    const prevFirst = prev && prev.breadcrumb ? prev.breadcrumb[0] : '';
    const curFirst = c.breadcrumb ? c.breadcrumb[0] : '';
    if (
      prev &&
      c.text.length < threshold &&
      prev.text.length + c.text.length <= CHUNK_TARGET_CHARS &&
      prevFirst === curFirst
    ) {
      prev.text += `\n\n${c.rawContent}`;
      prev.rawContent += `\n\n${c.rawContent}`;
    } else {
      out.push(Object.assign({}, c));
    }
  }
  return out;
}

/**
 * Flat sentence-boundary splitter — used when no structure is detected.
 * Also exported as `splitFlat` for callers that want the legacy behaviour.
 */
function splitFlat(text) {
  return splitLongText(text).filter((c) => c.length >= MIN_CHUNK_CHARS);
}

function splitLongText(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_TARGET_CHARS, text.length);
    let breakPoint = end;
    if (end < text.length) {
      const sub = text.substring(start, end);
      const lastBreak = Math.max(
        sub.lastIndexOf('\n'),
        sub.lastIndexOf('ฯ'),
        sub.lastIndexOf('。'),
        sub.lastIndexOf('. '),
      );
      if (lastBreak > CHUNK_TARGET_CHARS * 0.5) breakPoint = start + lastBreak + 1;
    }
    chunks.push(text.substring(start, breakPoint).trim());
    if (breakPoint >= text.length) break; // prevent infinite loop
    start = breakPoint - OVERLAP_CHARS;
    if (start < 0) start = 0;
  }
  return chunks;
}
