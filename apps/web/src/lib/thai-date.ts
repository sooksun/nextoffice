/**
 * Thai date utilities
 * DB / API stores dates as CE (ค.ศ.) — display to users in BE (พ.ศ. = CE + 543)
 */

const BE_OFFSET = 543;

const MONTHS_SHORT: Record<number, string> = {
  1: "ม.ค.", 2: "ก.พ.", 3: "มี.ค.", 4: "เม.ย.",
  5: "พ.ค.", 6: "มิ.ย.", 7: "ก.ค.", 8: "ส.ค.",
  9: "ก.ย.", 10: "ต.ค.", 11: "พ.ย.", 12: "ธ.ค.",
};

const MONTHS_LONG: Record<number, string> = {
  1: "มกราคม", 2: "กุมภาพันธ์", 3: "มีนาคม", 4: "เมษายน",
  5: "พฤษภาคม", 6: "มิถุนายน", 7: "กรกฎาคม", 8: "สิงหาคม",
  9: "กันยายน", 10: "ตุลาคม", 11: "พฤศจิกายน", 12: "ธันวาคม",
};

/** แปลงเลขอารบิค 0-9 เป็นเลขไทย ๐-๙ */
export function toThaiNumerals(text: string | number): string {
  return String(text).replace(/[0-9]/g, (d) => "๐๑๒๓๔๕๖๗๘๙"[+d]);
}

/** Format a date string or Date as "D เดือน พ.ศ." (BE, full month name) — Thai numerals */
export function formatThaiDate(raw: string | Date | null | undefined): string {
  if (!raw) return "—";
  const d = typeof raw === "string" ? new Date(raw) : raw;
  if (isNaN(d.getTime())) return "—";
  const day = d.getDate();
  const month = MONTHS_LONG[d.getMonth() + 1];
  const year = d.getFullYear() + BE_OFFSET;
  return toThaiNumerals(`${day} ${month} ${year}`);
}

/** Format as "D ม.ค. 67" (short month, 2-digit BE year) — Thai numerals */
export function formatThaiDateShort(raw: string | Date | null | undefined): string {
  if (!raw) return "—";
  const d = typeof raw === "string" ? new Date(raw) : raw;
  if (isNaN(d.getTime())) return "—";
  const day = d.getDate();
  const month = MONTHS_SHORT[d.getMonth() + 1];
  const year = String(d.getFullYear() + BE_OFFSET).slice(-2);
  return toThaiNumerals(`${day} ${month} ${year}`);
}

/** Format as "D/M/พ.ศ." e.g. "๑๕/๑/๒๕๖๗" — Thai numerals */
export function formatThaiDateNumeric(raw: string | Date | null | undefined): string {
  if (!raw) return "—";
  const d = typeof raw === "string" ? new Date(raw) : raw;
  if (isNaN(d.getTime())) return "—";
  return toThaiNumerals(`${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + BE_OFFSET}`);
}

/** Format as datetime: "๑๕ ม.ค. ๖๗, ๑๐:๓๐" — Thai numerals */
export function formatThaiDateTime(raw: string | Date | null | undefined): string {
  if (!raw) return "—";
  const d = typeof raw === "string" ? new Date(raw) : raw;
  if (isNaN(d.getTime())) return "—";
  const date = formatThaiDateShort(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${date}, ${toThaiNumerals(`${hh}:${mm}`)}`;
}

/** Parse a CE date string "YYYY-MM-DD" to a Date (for form inputs) */
export function parseCeDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}
