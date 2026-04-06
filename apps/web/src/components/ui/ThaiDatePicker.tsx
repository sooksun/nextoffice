"use client";

/**
 * ThaiDatePicker — เก็บ/รับ-ส่ง CE date string (YYYY-MM-DD)
 * แต่แสดงผลและเลื่อนปีเป็นพุทธศักราช (CE + 543)
 */

import "react-datepicker/dist/react-datepicker.css";
import DatePicker, { registerLocale, type ReactDatePickerCustomHeaderProps } from "react-datepicker";
import { th } from "date-fns/locale/th";
import { ChevronLeft, ChevronRight } from "lucide-react";

registerLocale("th", th);

const MONTHS_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** Standard Thai single-letter day abbreviations used in official calendars */
const WEEKDAY_ABBR: Record<string, string> = {
  "อาทิตย์": "อา",
  "จันทร์":   "จ",
  "อังคาร":   "อ",
  "พุธ":      "พ",
  "พฤหัสบดี": "พฤ",
  "ศุกร์":    "ศ",
  "เสาร์":    "ส",
};

// CE range ค.ศ. 1980–2080 (พ.ศ. 2523–2623) ครอบคลุมการใช้งานจริง
const CE_YEARS = Array.from({ length: 101 }, (_, i) => 1980 + i);

interface Props {
  value?: string;
  onChange: (value: string) => void;
  name?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/** Parse a CE date string (YYYY-MM-DD).
 *  Safety: if year > 2500 assume it is BE and subtract 543 before parsing. */
function ceStringToDate(s: string | undefined): Date | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const ceYear = year > 2500 ? year - 543 : year;
    const d = new Date(`${ceYear}-${iso[2]}-${iso[3]}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function dateToCeString(d: Date | null): string {
  if (!d) return "";
  const y = String(d.getFullYear()).padStart(4, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatBeDisplay(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear() + 543;
  return `${dd}/${mm}/${yyyy}`;
}

function formatWeekDay(dayName: string): string {
  return WEEKDAY_ABBR[dayName] ?? dayName.charAt(0);
}

function CustomHeader({
  date,
  decreaseMonth,
  increaseMonth,
  changeYear,
  changeMonth,
  prevMonthButtonDisabled,
  nextMonthButtonDisabled,
}: ReactDatePickerCustomHeaderProps) {
  return (
    <div className="flex items-center justify-between px-2 py-1 gap-1">
      <button
        type="button"
        onClick={decreaseMonth}
        disabled={prevMonthButtonDisabled}
        className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30"
      >
        <ChevronLeft size={16} />
      </button>

      <select
        value={date.getMonth()}
        onChange={(e) => changeMonth(Number(e.target.value))}
        className="text-sm font-semibold bg-transparent border-0 outline-none cursor-pointer"
      >
        {MONTHS_TH.map((m, i) => (
          <option key={i} value={i}>{m}</option>
        ))}
      </select>

      <select
        value={date.getFullYear()}
        onChange={(e) => changeYear(Number(e.target.value))}
        className="text-sm font-semibold bg-transparent border-0 outline-none cursor-pointer"
      >
        {CE_YEARS.map((y) => (
          <option key={y} value={y}>{y + 543}</option>
        ))}
      </select>

      <button
        type="button"
        onClick={increaseMonth}
        disabled={nextMonthButtonDisabled}
        className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export default function ThaiDatePicker({
  value,
  onChange,
  name,
  placeholder = "วว/ดด/พ.ศ.",
  className = "",
  disabled,
}: Props) {
  const selected = ceStringToDate(value);

  return (
    <div className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value ?? ""} />}

      <DatePicker
        selected={selected}
        onChange={(d: Date | null) => onChange(dateToCeString(d))}
        locale="th"
        dateFormat="dd/MM/yyyy"
        placeholderText={placeholder}
        disabled={disabled}
        isClearable
        renderCustomHeader={(props) => <CustomHeader {...props} />}
        formatWeekDay={formatWeekDay}
        calendarStartDay={0}
        className="input-date w-full cursor-pointer"
        value={selected ? formatBeDisplay(selected) : ""}
        wrapperClassName="w-full"
        popperClassName="z-50"
      />
    </div>
  );
}
