"use client";

/**
 * ThaiDatePicker — stores/emits CE date string (YYYY-MM-DD),
 * but displays and navigates using Buddhist Era (CE + 543).
 *
 * Props:
 *   value    – CE date string "YYYY-MM-DD" or ""
 *   onChange – called with new CE date string "YYYY-MM-DD" or ""
 *   name     – optional hidden input name (for <form> submission)
 *   placeholder – shown when no date selected
 *   className – extra classes on the outer wrapper
 *   disabled  – disable the picker
 */

import DatePicker, { registerLocale } from "react-datepicker";
import { th } from "date-fns/locale/th";
import { ChevronLeft, ChevronRight } from "lucide-react";

registerLocale("th", th);

const MONTHS_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

interface Props {
  value?: string;
  onChange: (value: string) => void;
  name?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function ceStringToDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function dateToCeString(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear().toString().padStart(4, "0");
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function ThaiDatePicker({
  value,
  onChange,
  name,
  placeholder = "วว/ดด/ปปปป",
  className = "",
  disabled,
}: Props) {
  const selected = ceStringToDate(value);

  return (
    <div className={`relative ${className}`}>
      {/* Hidden CE input for form submission */}
      {name && <input type="hidden" name={name} value={value ?? ""} />}

      <DatePicker
        selected={selected}
        onChange={(d) => onChange(dateToCeString(d as Date | null))}
        locale="th"
        dateFormat="dd/MM/yyyy"
        placeholderText={placeholder}
        disabled={disabled}
        isClearable
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
        // Override header to show BE year
        renderCustomHeader={({
          date,
          decreaseMonth,
          increaseMonth,
          changeYear,
          changeMonth,
          prevMonthButtonDisabled,
          nextMonthButtonDisabled,
        }) => {
          const beYear = date.getFullYear() + 543;
          // Build year options: CE range [1950..2100] → show as BE
          const ceYears = Array.from({ length: 151 }, (_, i) => 1950 + i);

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

              {/* Month select */}
              <select
                value={date.getMonth()}
                onChange={(e) => changeMonth(Number(e.target.value))}
                className="text-sm font-semibold bg-transparent border-0 outline-none cursor-pointer"
              >
                {MONTHS_TH.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>

              {/* Year select (shows BE) */}
              <select
                value={date.getFullYear()}
                onChange={(e) => changeYear(Number(e.target.value))}
                className="text-sm font-semibold bg-transparent border-0 outline-none cursor-pointer"
              >
                {ceYears.map((y) => (
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
        }}
        // Format the displayed value showing BE year
        formatWeekDay={(d) => d.slice(0, 2)}
        calendarStartDay={0}
        className="input-date w-full cursor-pointer"
        // Custom value display: dd/MM/BE_YEAR
        value={
          selected
            ? `${String(selected.getDate()).padStart(2, "0")}/${String(selected.getMonth() + 1).padStart(2, "0")}/${selected.getFullYear() + 543}`
            : ""
        }
        wrapperClassName="w-full"
      />
    </div>
  );
}
