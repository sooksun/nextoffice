"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useLiff } from "../../LiffBoot";

interface AttendanceRecord {
  id: number;
  date: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  geofenceValid: boolean;
  faceMatchScore: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  checked_in: "เข้าแล้ว",
  checked_out: "ออกแล้ว",
  late: "สาย",
  absent: "ขาด",
  leave: "ลา",
  travel: "ไปราชการ",
};

const STATUS_COLOR: Record<string, string> = {
  checked_in: "bg-sky-100 text-sky-800",
  checked_out: "bg-emerald-100 text-emerald-800",
  late: "bg-amber-100 text-amber-800",
  absent: "bg-rose-100 text-rose-800",
  leave: "bg-violet-100 text-violet-800",
  travel: "bg-cyan-100 text-cyan-800",
};

const DAY_LABEL = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

function calcHours(checkIn: string | null, checkOut: string | null): string | null {
  if (!checkIn || !checkOut) return null;
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  const hrs = diff / (1000 * 60 * 60);
  return hrs.toFixed(1);
}

export default function LiffAttendanceHistoryPage() {
  const { status } = useLiff();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "ready") return;
    const now = new Date();
    apiFetch<AttendanceRecord[]>(
      `/attendance/history?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
    )
      .then((d) => setRecords(Array.isArray(d) ? d : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [status]);

  // Take last 7 days (including today) — back-fill missing days as "no record"
  const days: { date: Date; key: string; record: AttendanceRecord | null }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const rec = records.find((r) => {
      const rd = new Date(r.date);
      return (
        rd.getFullYear() === d.getFullYear() &&
        rd.getMonth() === d.getMonth() &&
        rd.getDate() === d.getDate()
      );
    });
    days.push({ date: d, key, record: rec ?? null });
  }

  // Summary stats
  const totalDays = days.filter((d) => d.record).length;
  const totalHours = days.reduce((sum, d) => {
    if (!d.record?.checkInAt || !d.record?.checkOutAt) return sum;
    const diff =
      new Date(d.record.checkOutAt).getTime() - new Date(d.record.checkInAt).getTime();
    return sum + diff / (1000 * 60 * 60);
  }, 0);
  const lateCount = days.filter((d) => d.record?.status === "late").length;

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <h1 className="mb-1 text-lg font-semibold">ประวัติลงเวลา 7 วัน</h1>
      <p className="mb-4 text-xs text-slate-500">
        แสดงย้อนหลังตั้งแต่วันนี้ไป 7 วันก่อนหน้า
      </p>

      {loading && <div className="text-center text-sm text-slate-500">กำลังโหลด…</div>}

      {!loading && (
        <>
          {/* Summary */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <SummaryCard label="มา" value={`${totalDays}`} sub="วัน" />
            <SummaryCard label="รวมชม." value={totalHours.toFixed(1)} sub="ชั่วโมง" />
            <SummaryCard
              label="มาสาย"
              value={`${lateCount}`}
              sub="วัน"
              tone={lateCount > 0 ? "warn" : "ok"}
            />
          </div>

          {/* Day list */}
          <div className="space-y-2">
            {days.map((d, i) => (
              <DayRow key={d.key} day={d} isToday={i === 0} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone = "ok",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-lg bg-white p-3 text-center shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`text-xl font-bold ${
          tone === "warn" ? "text-amber-600" : "text-slate-800"
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] text-slate-400">{sub}</p>
    </div>
  );
}

function DayRow({
  day,
  isToday,
}: {
  day: { date: Date; key: string; record: AttendanceRecord | null };
  isToday: boolean;
}) {
  const dayName = DAY_LABEL[day.date.getDay()];
  const dateStr = `${day.date.getDate()}/${day.date.getMonth() + 1}`;
  const r = day.record;
  const hours = r ? calcHours(r.checkInAt, r.checkOutAt) : null;

  return (
    <div
      className={`rounded-lg bg-white p-3 shadow-sm ${
        isToday ? "ring-2 ring-indigo-300" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-center">
            <p className="text-[10px] text-slate-500">{dayName}</p>
            <p className="text-sm font-bold text-slate-700">{dateStr}</p>
          </div>
          {isToday && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-700">
              วันนี้
            </span>
          )}
        </div>
        {r ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-600"
            }`}
          >
            {STATUS_LABEL[r.status] ?? r.status}
          </span>
        ) : (
          <span className="text-xs text-slate-400">ไม่มีข้อมูล</span>
        )}
      </div>

      {r && (
        <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
          <span>
            <span className="text-slate-400">เข้า </span>
            {formatTime(r.checkInAt)}
          </span>
          <span>
            <span className="text-slate-400">ออก </span>
            {formatTime(r.checkOutAt)}
          </span>
          {hours && (
            <span className="ml-auto text-slate-500">
              <span className="text-slate-400">รวม </span>
              {hours} ชม.
            </span>
          )}
          {!r.geofenceValid && (
            <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
              นอกที่ทำงาน
            </span>
          )}
        </div>
      )}
    </div>
  );
}
