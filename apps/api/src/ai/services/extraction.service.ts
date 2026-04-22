import { Injectable, Logger } from '@nestjs/common';
import { GeminiApiService } from '../../gemini/gemini-api.service';
import { SystemPromptsService } from '../../system-prompts/system-prompts.service';

export interface StructuredSummary {
  sender: string;       // ใคร/หน่วยงานใดส่งมา
  request: string;      // ขอให้ทำอะไร / ประชาสัมพันธ์
  location: string | null;   // สถานที่ (null ถ้าไม่มี)
  deadline: string | null;   // กำหนดวันที่ (null ถ้าไม่มี)
  summarizedBy: string; // ชื่อผู้สรุป
}

export interface OfficialMetadata {
  issuingAuthority: string;
  recipient: string;
  documentNo: string;
  documentDate: string;
  subjectText: string;
  deadlineDate: string;
  summary: string;
  structuredSummary: StructuredSummary | null;
  intent: string;
  urgency: string;
  actions: string[];
  isMeeting: boolean;
  meetingDate: string;
  meetingTime: string;
  meetingLocation: string;
}

/** Convert a date string from BE to CE if the year looks like Buddhist Era (> 2500).
 *  Accepts YYYY-MM-DD or DD/MM/YYYY. Returns YYYY-MM-DD CE string or empty string. */
function normalizeDateToCe(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = raw.trim();
  // Match YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const ceYear = year > 2500 ? year - 543 : year;
    return `${ceYear}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  // Match DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const year = parseInt(dmyMatch[3], 10);
    const ceYear = year > 2500 ? year - 543 : year;
    return `${ceYear}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  return '';
}

// ── Thai digit/month helpers ─────────────────────────────────────────────
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
function thaiToArabic(s: string): string {
  return s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
}
const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1, กุมภาพันธ์: 2, มีนาคม: 3, เมษายน: 4,
  พฤษภาคม: 5, มิถุนายน: 6, กรกฎาคม: 7, สิงหาคม: 8,
  กันยายน: 9, ตุลาคม: 10, พฤศจิกายน: 11, ธันวาคม: 12,
};

/** Regex-based extraction from OCR text — ใช้เป็น fallback เมื่อ Gemini คืนฟิลด์ว่าง */
function regexFallback(text: string): { docNo: string; docDate: string; authority: string } {
  // Document number: "ที่ ศธ 0504/..." / "ที่ กสศ.06/..." / "ที่ ศธ ๐๕๐๔๕/๑ ๔๗๓"
  const docNoMatch = text.match(
    /ที่\s+((?:[ก-ฮa-zA-Z]{1,6}\.?\s*){1,3}[๐-๙\d][ก-ฮ๐-๙\d\w\s\/\.()-]{1,40})/,
  );
  // Thai date: "๑๓ มีนาคม ๒๕๖๙" or "13 มีนาคม 2569"
  const dateMatch = text.match(
    /([๐-๙\d]{1,2})\s+(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+([๐-๙\d]{4})/,
  );
  // Issuing authority: lines starting with สำนักงาน/กระทรวง/กรม/โรงเรียน/เทศบาล/องค์การ/สถาบัน/ศูนย์
  const authMatch = text.match(
    /((?:สำนักงาน(?:เขต|คณะ|ปลัด)?|กระทรวง|กรม(?:การ|พัฒนา|ควบคุม|สรรพ)?|โรงเรียน|เทศบาล|องค์การ|สถาบัน|ศูนย์|มหาวิทยาลัย)[^\n\r]{5,100})/,
  );

  let docNo = '';
  if (docNoMatch) {
    docNo = docNoMatch[1].replace(/\s+/g, ' ').replace(/[)(]/g, '').trim();
  }

  let docDate = '';
  if (dateMatch) {
    const day = parseInt(thaiToArabic(dateMatch[1]), 10);
    const month = THAI_MONTHS[dateMatch[2]] || 0;
    const yearRaw = parseInt(thaiToArabic(dateMatch[3]), 10);
    const yearCE = yearRaw > 2500 ? yearRaw - 543 : yearRaw;
    if (day && month && yearCE) {
      docDate = `${yearCE}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  let authority = '';
  if (authMatch) {
    authority = authMatch[1].replace(/\s+/g, ' ').trim();
  }

  return { docNo, docDate, authority };
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private readonly gemini: GeminiApiService,
    private readonly prompts: SystemPromptsService,
  ) {}

  async extractOfficialMetadata(extractedText: string): Promise<OfficialMetadata> {
    if (!this.gemini.getApiKey()) {
      return this.fallbackExtraction(extractedText);
    }

    const p = await this.prompts.get('extract.metadata');
    const prompt = p.promptText.replace('{{extracted_text}}', extractedText.substring(0, 4000));

    try {
      const rawText =
        (await this.gemini.generateText({
          user: prompt,
          maxOutputTokens: p.maxTokens,
          temperature: p.temperature,
          disableThinking: true, // JSON task — avoid thinking tokens eating output budget
        })) || '';

      this.logger.log(
        `Extraction: model=${this.gemini.getModel()} text=${extractedText.length}ch raw=${rawText.length}ch preview="${rawText.substring(0, 120).replace(/\n/g, ' ')}"`,
      );

      if (!rawText) {
        this.logger.warn(`Extraction: Gemini returned empty — using fallback`);
        return this.fallbackExtraction(extractedText);
      }

      // Normalize fullwidth brackets/punctuation that Gemini sometimes returns
      const normalized = rawText
        .replace(/｛/g, '{')
        .replace(/｝/g, '}')
        .replace(/：/g, ':')
        .replace(/，/g, ',');

      // Extract JSON: find first '{' and last '}' — handles ```json fences, prose wrappers, etc.
      const start = normalized.indexOf('{');
      const end = normalized.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) {
        const codes = [...rawText.substring(0, 40)].map((c) => c.charCodeAt(0)).join(',');
        const rawPreview = rawText.substring(0, 200).replace(/\n/g, '\\n');
        this.logger.warn(`Extraction: no JSON found — start=${start} end=${end} charCodes=[${codes}] raw="${rawPreview}"`);
        return this.fallbackExtraction(extractedText);
      }
      const parsed = JSON.parse(normalized.substring(start, end + 1));

      // Parse structured_summary ถ้ามี
      let structuredSummary: StructuredSummary | null = null;
      if (parsed.structured_summary && typeof parsed.structured_summary === 'object') {
        const ss = parsed.structured_summary;
        structuredSummary = {
          sender: ss.sender || parsed.issuing_authority || '',
          request: ss.request || '',
          location: ss.location && ss.location !== 'null' ? ss.location : null,
          deadline: ss.deadline && ss.deadline !== 'null' ? ss.deadline : null,
          summarizedBy: ss.summarized_by || 'NextOffice AI',
        };
      }

      // Regex fallback สำหรับฟิลด์ที่ Gemini ส่งค่าว่าง (ดึงจาก OCR text ต้นฉบับ)
      const rx = regexFallback(extractedText);

      // issuing_authority: Gemini → structuredSummary.sender → regex fallback
      const issuingAuthority =
        (parsed.issuing_authority as string)?.trim() ||
        structuredSummary?.sender?.trim() ||
        rx.authority ||
        '';

      // document_no: Gemini บางครั้งส่งเป็น number หรือว่าง — แปลงเป็น string + regex fallback
      const documentNo = String(parsed.document_no ?? '').trim() || rx.docNo;

      // document_date: Gemini → regex fallback จาก Thai date pattern
      const documentDate = normalizeDateToCe(parsed.document_date) || rx.docDate;

      this.logger.log(
        `Extraction fields: authority="${issuingAuthority.substring(0, 40)}" date="${documentDate}" no="${documentNo}" geminiRaw={ia:"${(parsed.issuing_authority || '').substring(0, 20)}" dd:"${parsed.document_date || ''}" dn:"${parsed.document_no || ''}"}`,
      );

      return {
        issuingAuthority,
        recipient: parsed.recipient || '',
        documentNo,
        documentDate,
        subjectText: parsed.subject || '',
        deadlineDate: normalizeDateToCe(parsed.deadline_date),
        summary: parsed.summary || '',
        structuredSummary,
        intent: parsed.intent || '',
        urgency: parsed.urgency || 'กลาง',
        actions: parsed.actions || [],
        isMeeting: parsed.is_meeting === true || parsed.is_meeting === 'true',
        meetingDate: normalizeDateToCe(parsed.meeting_date),
        meetingTime: parsed.meeting_time || '',
        meetingLocation: parsed.meeting_location || '',
      };
    } catch (err) {
      this.logger.error(`Metadata extraction failed: ${err.message}`);
      return this.fallbackExtraction(extractedText);
    }
  }

  private fallbackExtraction(text: string): OfficialMetadata {
    const subjectMatch = text.match(/เรื่อง\s+(.+)/);
    const docNoMatch = text.match(/ที่\s+([\w\/\.-]+)/);
    const recipientMatch = text.match(/เรียน\s+(.+)/);
    return {
      issuingAuthority: '',
      recipient: recipientMatch?.[1]?.trim() || '',
      documentNo: docNoMatch?.[1] || '',
      documentDate: '',
      subjectText: subjectMatch?.[1] || '',
      deadlineDate: '',
      summary: text.substring(0, 200),
      structuredSummary: null,
      intent: '',
      urgency: 'กลาง',
      actions: [],
      isMeeting: false,
      meetingDate: '',
      meetingTime: '',
      meetingLocation: '',
    };
  }
}
