import { format } from "date-fns";

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const THAI_DAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const THAI_DAYS_FULL = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];

export function toBE(year: number): number {
  return year + 543;
}

export function thaiMonthFull(date: Date): string {
  return THAI_MONTHS_FULL[date.getMonth()];
}

export function thaiMonthShort(date: Date): string {
  return THAI_MONTHS_SHORT[date.getMonth()];
}

export function thaiDayShort(dayIndex: number): string {
  return THAI_DAYS_SHORT[dayIndex];
}

export function thaiDayFull(dayIndex: number): string {
  return THAI_DAYS_FULL[dayIndex];
}

/** e.g. "13 เม.ย. 2569" */
export function formatThaiShort(date: Date): string {
  return `${date.getDate()} ${thaiMonthShort(date)} ${toBE(date.getFullYear())}`;
}

/** e.g. "เมษายน 2569" */
export function formatThaiMonthYear(date: Date): string {
  return `${thaiMonthFull(date)} ${toBE(date.getFullYear())}`;
}

/** e.g. "13 เมษายน 2569" */
export function formatThaiFull(date: Date): string {
  return `${date.getDate()} ${thaiMonthFull(date)} ${toBE(date.getFullYear())}`;
}

/** e.g. "วันอาทิตย์, 13 เมษายน 2569" */
export function formatThaiFullWithDay(date: Date): string {
  return `${thaiDayFull(date.getDay())}, ${formatThaiFull(date)}`;
}

/** Time in 24hr format e.g. "14:30 น." */
export function formatThaiTime(date: Date): string {
  return format(date, "HH:mm") + " น.";
}

/** Time range e.g. "14:30 - 15:00 น." */
export function formatThaiTimeRange(start: Date, end: Date): string {
  return `${format(start, "HH:mm")} - ${format(end, "HH:mm")} น.`;
}

export const THAI_WEEK_DAYS_SHORT = THAI_DAYS_SHORT;
export const THAI_DAYS_WORKING = [
  { index: 0, name: "วันอาทิตย์" },
  { index: 1, name: "วันจันทร์" },
  { index: 2, name: "วันอังคาร" },
  { index: 3, name: "วันพุธ" },
  { index: 4, name: "วันพฤหัสบดี" },
  { index: 5, name: "วันศุกร์" },
  { index: 6, name: "วันเสาร์" },
];
