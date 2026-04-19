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

export const MONTHS_LONG: Record<number, string> = {
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

// ─── Thai date picker struct ───────────────────────────────────────────────

export interface ThaiDate {
  day: number;    // 1–31
  month: number;  // 1–12
  yearBE: number; // พ.ศ. e.g. 2568
  hour: number;   // 0–23
  minute: number; // 0–59
}

/** Parse an ISO string (or null/undefined) into a ThaiDate struct */
export function isoToThaiDate(iso: string | null | undefined): ThaiDate {
  const d = iso ? new Date(iso) : new Date();
  return {
    day: d.getDate(),
    month: d.getMonth() + 1,
    yearBE: d.getFullYear() + BE_OFFSET,
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

/** Convert a ThaiDate struct back to an ISO 8601 string */
export function thaiDateToIso(td: ThaiDate): string {
  return new Date(td.yearBE - BE_OFFSET, td.month - 1, td.day, td.hour, td.minute, 0).toISOString();
}

/** Format as "D เดือน พ.ศ." with optional " เวลา HH:MM น." — Arabic numerals */
export function formatThaiDateLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const yearBE = d.getFullYear() + BE_OFFSET;
    const month = MONTHS_LONG[d.getMonth() + 1];
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const time = d.getHours() !== 0 || d.getMinutes() !== 0 ? ` เวลา ${h}:${m} น.` : "";
    return `${d.getDate()} ${month} ${yearBE}${time}`;
  } catch {
    return iso;
  }
}
