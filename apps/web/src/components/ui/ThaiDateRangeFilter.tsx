"use client";

/**
 * ThaiDateRangeFilter — date range filter pair (dateFrom / dateTo)
 * ใช้แทน <input type="date"> ใน Server Component filter forms
 * ส่งค่าเป็น CE "YYYY-MM-DD" ผ่าน URL search params
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import ThaiDatePicker from "./ThaiDatePicker";

interface Props {
  dateFrom?: string;  // initial CE value from searchParams
  dateTo?: string;    // initial CE value from searchParams
  /** extra params to preserve on submit (e.g. search text — NOT dateFrom/dateTo) */
  preserveParams?: Record<string, string>;
}

export default function ThaiDateRangeFilter({ dateFrom = "", dateTo = "", preserveParams = {} }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = {
    dateFrom: dateFrom || "",
    dateTo:   dateTo   || "",
  };

  const push = (next: typeof current) => {
    const params = new URLSearchParams();
    // preserve non-date params (search text etc.) from current URL
    searchParams.forEach((v, k) => {
      if (k !== "dateFrom" && k !== "dateTo") params.set(k, v);
    });
    // override with caller's preserve map
    Object.entries(preserveParams).forEach(([k, v]) => v && params.set(k, v));
    // set date range
    if (next.dateFrom) params.set("dateFrom", next.dateFrom);
    if (next.dateTo)   params.set("dateTo",   next.dateTo);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ThaiDatePicker
        value={current.dateFrom}
        onChange={(v) => push({ ...current, dateFrom: v })}
        placeholder="ตั้งแต่วันที่"
        className="w-40"
      />
      <span className="text-on-surface-variant text-sm">–</span>
      <ThaiDatePicker
        value={current.dateTo}
        onChange={(v) => push({ ...current, dateTo: v })}
        placeholder="ถึงวันที่"
        className="w-40"
      />
    </div>
  );
}
