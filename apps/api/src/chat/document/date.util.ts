/**
 * Date helpers สำหรับ AI document composition.
 *
 * กฎ: เก็บใน DB เป็น Gregorian (CE) เสมอ. LLM อาจคืน พ.ศ. (BE) หรือเลขไทย —
 * normalize ที่ boundary นี้. relative date ("พรุ่งนี้") ให้ LLM แก้โดยส่ง
 * "วันนี้" เข้า prompt (timezone Asia/Bangkok) — util นี้ไม่เดา relative เอง.
 */

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

export function thaiToArabic(s: string): string {
  return s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
}

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** ปี > 2400 ถือเป็น พ.ศ. → ลบ 543 เป็น ค.ศ. */
function beToCeYear(year: number): number {
  return year > 2400 ? year - 543 : year;
}

function buildIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // ตรวจวันจริง (กัน 31 ก.พ. ฯลฯ) ด้วย UTC เพื่อเลี่ยง DST/tz drift
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Normalize วันที่จาก LLM → ISO `YYYY-MM-DD` (CE) หรือ null ถ้า parse ไม่ได้.
 * รองรับ: YYYY-MM-DD, DD/MM/YYYY, เลขไทย, ปี พ.ศ.
 */
export function normalizeIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = thaiToArabic(String(raw).trim());
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return buildIso(beToCeYear(+m[1]), +m[2], +m[3]);

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return buildIso(beToCeYear(+m[3]), +m[2], +m[1]);

  return null;
}

/** จำนวนวันแบบนับรวมหัวท้าย (inclusive) — endDate >= startDate, ขั้นต่ำ 1 */
export function daysBetweenInclusive(startIso: string, endIso: string): number {
  const a = Date.parse(`${startIso}T00:00:00Z`);
  const b = Date.parse(`${endIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  const diff = Math.floor((b - a) / 86_400_000) + 1;
  return diff >= 1 ? diff : 1;
}

/** วันนี้ (Asia/Bangkok) เป็น ISO `YYYY-MM-DD` — กัน server-tz drift ใกล้เที่ยงคืน */
export function bangkokTodayIso(now: Date): string {
  // en-CA ให้รูปแบบ YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** แปลง ISO (CE) → ข้อความไทยแบบสั้น พ.ศ. เช่น "5 ก.ค. 2569" (สำหรับการ์ดสรุป) */
export function toThaiDisplay(iso: string | null | undefined): string {
  const norm = normalizeIsoDate(iso);
  if (!norm) return '';
  const [y, mo, d] = norm.split('-').map((x) => parseInt(x, 10));
  const month = THAI_MONTHS_SHORT[mo - 1] ?? '';
  return `${d} ${month} ${y + 543}`;
}

/** ชื่อวันในสัปดาห์ภาษาไทยของ ISO date (สำหรับใส่ใน prompt ช่วย resolve "จันทร์หน้า") */
export function thaiWeekday(iso: string): string {
  const names = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return '';
  return names[new Date(t).getUTCDay()] ?? '';
}

/** true ถ้า HH:mm valid (00:00–23:59) */
export function isValidTime(s: string | null | undefined): boolean {
  if (!s) return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s).trim());
}
