import { Injectable, Logger } from '@nestjs/common';
import { GeminiApiService } from '../../gemini/gemini-api.service';
import {
  DocType,
  canonicalLeaveType,
  LeaveType,
} from '../document/document-spec';
import {
  bangkokTodayIso,
  isValidTime,
  normalizeIsoDate,
  thaiWeekday,
  toThaiDisplay,
} from '../document/date.util';

/** ฟิลด์ที่สกัดได้จากข้อความผู้ใช้ (เฉพาะส่วนที่ต้องมาจากผู้ใช้เอง) */
export interface ExtractedFields {
  leaveType: LeaveType | null;
  startDate: string | null; // ISO CE
  endDate: string | null;
  reason: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  travelDate: string | null;
  destination: string | null;
  purpose: string | null;
  departureTime: string | null;
  returnTime: string | null;
  returnSameDay: boolean | null;
}

export interface ClassifyResult {
  intent: 'ask' | 'create_document';
  /** 'other' = ขอสร้างเอกสารแต่ไม่ใช่ leave/travel ที่รองรับ */
  docType: DocType | 'other' | null;
  fields: ExtractedFields;
}

const EMPTY_FIELDS: ExtractedFields = {
  leaveType: null,
  startDate: null,
  endDate: null,
  reason: null,
  contactPhone: null,
  contactAddress: null,
  travelDate: null,
  destination: null,
  purpose: null,
  departureTime: null,
  returnTime: null,
  returnSameDay: null,
};

@Injectable()
export class DocumentIntentService {
  private readonly logger = new Logger(DocumentIntentService.name);

  constructor(private readonly gemini: GeminiApiService) {}

  /**
   * แยกเจตนา (ask vs create_document) + สกัดฟิลด์ ในการเรียก LLM ครั้งเดียว.
   * ถ้า LLM ใช้ไม่ได้/parse ไม่ได้ → fallback เป็น intent 'ask' (ไม่ทำให้ flow เดิมพัง).
   */
  async classify(message: string, now: Date): Promise<ClassifyResult> {
    if (!this.gemini.getApiKey()) {
      return { intent: 'ask', docType: null, fields: { ...EMPTY_FIELDS } };
    }

    const todayIso = bangkokTodayIso(now);
    const system = this.buildSystemPrompt(todayIso);

    let raw = '';
    try {
      raw =
        (await this.gemini.generateText({
          system,
          user: message,
          maxOutputTokens: 700,
          temperature: 0,
          disableThinking: true, // JSON task — กัน thinking token กิน budget จน JSON ขาด
        })) || '';
    } catch (err) {
      this.gemini.logAxiosError('DocumentIntent classify', err);
      return { intent: 'ask', docType: null, fields: { ...EMPTY_FIELDS } };
    }

    const parsed = this.parseJson(raw);
    if (!parsed) {
      this.logger.warn(
        `classify: no JSON — raw="${raw.substring(0, 160).replace(/\n/g, ' ')}"`,
      );
      return { intent: 'ask', docType: null, fields: { ...EMPTY_FIELDS } };
    }

    const intent = parsed.intent === 'create_document' ? 'create_document' : 'ask';
    const docType = this.resolveDocType(parsed.doc_type);
    const fields = this.normalizeFields(parsed);

    this.logger.log(
      `classify: intent=${intent} docType=${docType ?? '-'} ` +
        `leave=${fields.leaveType ?? '-'} start=${fields.startDate ?? '-'} ` +
        `end=${fields.endDate ?? '-'} travel=${fields.travelDate ?? '-'}`,
    );

    return { intent, docType, fields };
  }

  // ─── Prompt ───────────────────────────────────────────────────────────

  private buildSystemPrompt(todayIso: string): string {
    const todayThai = toThaiDisplay(todayIso);
    const weekday = thaiWeekday(todayIso);
    return (
      `คุณเป็นตัวช่วยแยกเจตนาและสกัดข้อมูลจากข้อความของผู้ใช้ในระบบงานสารบรรณโรงเรียน\n` +
      `วันนี้คือ วัน${weekday}ที่ ${todayThai} (ISO: ${todayIso})\n\n` +
      `งานของคุณ: อ่านข้อความผู้ใช้ แล้วตอบกลับเป็น JSON object เดียวเท่านั้น (ห้ามมีข้อความอื่นนอก JSON)\n\n` +
      `1) แยกเจตนา (intent):\n` +
      `   - "create_document" = ผู้ใช้ต้องการ "สร้าง/ทำ/ขอ" เอกสาร เช่น ขอลา ไปราชการ\n` +
      `   - "ask" = ผู้ใช้ถามคำถาม ขอข้อมูล หรือสอบถามระเบียบ (ไม่ใช่สั่งสร้างเอกสาร)\n\n` +
      `2) ระบุประเภทเอกสาร (doc_type): "leave" (ใบลา) | "travel" (ไปราชการ) | "other" | null\n\n` +
      `3) สกัดข้อมูลเท่าที่มีในข้อความ (ไม่มี = null ห้ามเดา):\n` +
      `   - leave_type: หนึ่งใน sick|personal|vacation|maternity|ordination|training\n` +
      `       (ป่วย=sick, กิจ/ธุระ=personal, พักผ่อน=vacation, คลอด=maternity, บวช=ordination, ศึกษา/อบรม=training)\n` +
      `   - start_date, end_date, travel_date: รูปแบบ YYYY-MM-DD ปฏิทินสากล (ค.ศ.) เท่านั้น\n` +
      `       * แปลงวันสัมพัทธ์โดยอ้างอิงวันนี้: "พรุ่งนี้"=วันถัดไป, "มะรืน"=+2, "จันทร์หน้า"=วันจันทร์ของสัปดาห์ถัดไป\n` +
      `       * ถ้าระบุจำนวนวัน N วันโดยมีวันเริ่ม ให้คำนวณ end_date = start_date + (N-1) วัน (นับรวมหัวท้าย)\n` +
      `       * ถ้าผู้ใช้ให้ปี พ.ศ. ให้แปลงเป็น ค.ศ. (ลบ 543) ก่อนใส่\n` +
      `   - reason: เหตุผลการลา (string) | null\n` +
      `   - destination: จุดหมายปลายทางการไปราชการ | null\n` +
      `   - purpose: วัตถุประสงค์การไปราชการ | null\n` +
      `   - departure_time, return_time: รูปแบบ HH:mm 24 ชั่วโมง | null\n` +
      `   - return_same_day: true ถ้ากลับวันเดียวกัน, false ถ้าค้างคืน, null ถ้าไม่ระบุ\n` +
      `   - contact_phone, contact_address: เฉพาะกรณีผู้ใช้ระบุเองในข้อความ | null\n\n` +
      `รูปแบบ JSON ที่ต้องตอบ:\n` +
      `{"intent":"...","doc_type":"...","leave_type":null,"start_date":null,"end_date":null,` +
      `"reason":null,"travel_date":null,"destination":null,"purpose":null,` +
      `"departure_time":null,"return_time":null,"return_same_day":null,` +
      `"contact_phone":null,"contact_address":null}`
    );
  }

  // ─── Parsing helpers ──────────────────────────────────────────────────

  private parseJson(raw: string): Record<string, unknown> | null {
    if (!raw) return null;
    // normalize fullwidth ที่ Gemini บางครั้งส่งมา (กัน JSON.parse fail)
    const normalized = raw
      .replace(/｛/g, '{')
      .replace(/｝/g, '}')
      .replace(/：/g, ':')
      .replace(/，/g, ',');
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(normalized.substring(start, end + 1));
    } catch {
      return null;
    }
  }

  private resolveDocType(value: unknown): DocType | 'other' | null {
    if (value === 'leave' || value === 'travel') return value;
    if (value === 'other') return 'other';
    return null;
  }

  private normalizeFields(parsed: Record<string, unknown>): ExtractedFields {
    const str = (v: unknown): string | null => {
      if (typeof v !== 'string') return null;
      const t = v.trim();
      return t && t.toLowerCase() !== 'null' ? t : null;
    };
    const time = (v: unknown): string | null => {
      const t = str(v);
      return t && isValidTime(t) ? t : null;
    };
    const bool = (v: unknown): boolean | null =>
      v === true || v === false ? v : null;

    return {
      leaveType: canonicalLeaveType(parsed.leave_type),
      startDate: normalizeIsoDate(str(parsed.start_date)),
      endDate: normalizeIsoDate(str(parsed.end_date)),
      reason: str(parsed.reason),
      contactPhone: str(parsed.contact_phone),
      contactAddress: str(parsed.contact_address),
      travelDate: normalizeIsoDate(str(parsed.travel_date)),
      destination: str(parsed.destination),
      purpose: str(parsed.purpose),
      departureTime: time(parsed.departure_time),
      returnTime: time(parsed.return_time),
      returnSameDay: bool(parsed.return_same_day),
    };
  }
}
