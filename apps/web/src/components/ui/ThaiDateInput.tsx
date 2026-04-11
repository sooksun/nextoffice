"use client";

import { useState, useEffect } from "react";

const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

interface ThaiDateInputProps {
  name: string;
  required?: boolean;
  defaultValue?: string; // CE ISO date "YYYY-MM-DD"
  onChange?: (ceDate: string) => void;
}

function daysInMonth(month: number, ceYear: number): number {
  return new Date(ceYear, month, 0).getDate();
}

export default function ThaiDateInput({ name, required, defaultValue, onChange }: ThaiDateInputProps) {
  const today = new Date();
  const initCe = defaultValue ? new Date(defaultValue + "T00:00:00") : null;

  const [day, setDay]     = useState<string>(initCe ? String(initCe.getDate()) : "");
  const [month, setMonth] = useState<string>(initCe ? String(initCe.getMonth() + 1) : "");
  const [beYear, setBeYear] = useState<string>(initCe ? String(initCe.getFullYear() + 543) : "");

  // Compute CE ISO from current inputs
  const ceDate = (() => {
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const be = parseInt(beYear, 10);
    if (!d || !m || !be || be < 2500 || be > 2600) return "";
    const ce = be - 543;
    const maxDay = daysInMonth(m, ce);
    const safeDay = Math.min(d, maxDay);
    return `${ce}-${String(m).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
  })();

  useEffect(() => {
    if (ceDate && onChange) onChange(ceDate);
  }, [ceDate, onChange]);

  const currentBeYear = today.getFullYear() + 543;

  return (
    <div className="flex items-center gap-2">
      {/* Day */}
      <input
        type="number"
        min={1}
        max={31}
        placeholder="วัน"
        value={day}
        onChange={(e) => setDay(e.target.value)}
        className="input-text w-16 text-center"
        required={required}
      />
      {/* Month */}
      <select
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="input-select flex-1"
        required={required}
      >
        <option value="">-- เดือน --</option>
        {MONTHS.map((m, i) => (
          <option key={i + 1} value={String(i + 1)}>{m}</option>
        ))}
      </select>
      {/* Year (พ.ศ.) */}
      <input
        type="number"
        min={2500}
        max={2600}
        placeholder="ปี พ.ศ."
        value={beYear}
        onChange={(e) => setBeYear(e.target.value)}
        className="input-text w-24 text-center"
        required={required}
        defaultValue={beYear || currentBeYear}
      />
      {/* Hidden CE value for form submission */}
      <input type="hidden" name={name} value={ceDate} required={required} />
    </div>
  );
}
