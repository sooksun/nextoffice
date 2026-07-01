/**
 * Document-composition specs — ใช้ร่วมกันทั้ง intent extraction, autofill,
 * validation และข้อความ popup ฝั่ง frontend.
 *
 * เพิ่มเอกสารประเภทใหม่ในอนาคต = เพิ่ม entry ใน DOC_SPECS + map การ build draft
 * ใน DocumentDraftService เท่านั้น (field metadata อยู่ที่เดียว).
 */

export type DocType = 'leave' | 'travel';

export const SUPPORTED_DOC_TYPES: DocType[] = ['leave', 'travel'];

export type FieldSource = 'system' | 'extract' | 'derived';

export interface DocFieldSpec {
  key: string;
  /** ป้ายชื่อภาษาไทย — ใช้ทั้งใน popup "ขาดข้อมูล" และการ์ดสรุป */
  label: string;
  /** business-required — ฟิลด์ที่ผู้ใช้ต้องยืนยันก่อน submit (ขับ missingFields) */
  required: boolean;
  source: FieldSource;
}

export interface DocSpec {
  docType: DocType;
  /** ชื่อเอกสารภาษาไทย เช่น "ใบลา" */
  label: string;
  /** หน้าฟอร์มปลายทางสำหรับ redirect (จะแนบ ?draftId= ต่อท้าย) */
  formUrl: string;
  fields: DocFieldSpec[];
}

export const DOC_SPECS: Record<DocType, DocSpec> = {
  leave: {
    docType: 'leave',
    label: 'ใบลา',
    formUrl: '/leave/new',
    fields: [
      { key: 'leaveType', label: 'ประเภทการลา', required: true, source: 'extract' },
      { key: 'startDate', label: 'วันที่เริ่มลา', required: true, source: 'extract' },
      { key: 'endDate', label: 'วันที่สิ้นสุดการลา', required: true, source: 'extract' },
      { key: 'reason', label: 'เหตุผลการลา', required: false, source: 'extract' },
      { key: 'totalDays', label: 'จำนวนวันลา', required: false, source: 'derived' },
      { key: 'positionTitle', label: 'ตำแหน่ง', required: false, source: 'system' },
      { key: 'contactPhone', label: 'เบอร์ติดต่อ', required: false, source: 'system' },
      { key: 'contactAddress', label: 'ที่อยู่ติดต่อระหว่างลา', required: false, source: 'system' },
    ],
  },
  travel: {
    docType: 'travel',
    label: 'ใบขออนุญาตไปราชการ',
    formUrl: '/leave/travel/new',
    fields: [
      { key: 'travelDate', label: 'วันที่เดินทาง', required: true, source: 'extract' },
      { key: 'destination', label: 'สถานที่/จุดหมายปลายทาง', required: true, source: 'extract' },
      { key: 'purpose', label: 'วัตถุประสงค์ในการเดินทาง', required: true, source: 'extract' },
      { key: 'departureTime', label: 'เวลาออกเดินทาง', required: false, source: 'extract' },
      { key: 'returnTime', label: 'เวลากลับ', required: false, source: 'extract' },
    ],
  },
};

export function isSupportedDocType(value: unknown): value is DocType {
  return typeof value === 'string' && (SUPPORTED_DOC_TYPES as string[]).includes(value);
}

// ─── Leave type canonicalisation ──────────────────────────────────────────

/** canonical leave types ที่ schema รองรับ */
export const LEAVE_TYPES = [
  'sick',
  'personal',
  'vacation',
  'maternity',
  'ordination',
  'training',
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  sick: 'ลาป่วย',
  personal: 'ลากิจ',
  vacation: 'ลาพักผ่อน',
  maternity: 'ลาคลอด',
  ordination: 'ลาบวช',
  training: 'ลาศึกษาต่อ',
};

/** Thai synonym → canonical leave type — กัน LLM คืนคำไทยแทน enum */
const LEAVE_TYPE_SYNONYMS: Array<[RegExp, LeaveType]> = [
  [/ป่วย|sick/i, 'sick'],
  [/พักผ่อน|vacation|annual/i, 'vacation'],
  [/คลอด|maternity/i, 'maternity'],
  [/บวช|อุปสมบท|ordination/i, 'ordination'],
  [/ศึกษา|อบรม|training|study/i, 'training'],
  [/กิจ|ธุระ|personal/i, 'personal'],
];

/** Map ค่าที่ LLM ส่งมา (อาจเป็น canonical หรือคำไทย) → canonical leave type | null */
export function canonicalLeaveType(value: unknown): LeaveType | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if ((LEAVE_TYPES as readonly string[]).includes(v)) return v as LeaveType;
  for (const [re, canonical] of LEAVE_TYPE_SYNONYMS) {
    if (re.test(value)) return canonical;
  }
  return null;
}

// ─── Keyword gate ─────────────────────────────────────────────────────────

/**
 * High-recall keyword gate — ตัดสินว่า "ควรเรียก LLM classify ไหม".
 * ถ้าไม่ match → ข้ามไป RAG Q&A ทันที (ไม่เสีย latency/cost กับคำถามทั่วไป).
 * ความแม่นยำเป็นหน้าที่ของ LLM (gate over-trigger ได้ ไม่เป็นไร).
 */
const DOC_TRIGGER =
  /(ใบลา|ลาป่วย|ลากิจ|ลาพักผ่อน|ลาคลอด|ลาบวช|ลาศึกษา|ลาหยุด|ลางาน|ขอลา|จะลา|อยากลา|ไปราชการ|ใบไปราชการ|ขอไปราชการ|เดินทางไปราชการ|สร้างเอกสาร|ทำเอกสาร|สร้างใบ|ทำใบ|ออกใบ|กรอกใบ)/;

export function looksLikeDocumentRequest(message: string): boolean {
  return DOC_TRIGGER.test(message);
}
