"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useLiff } from "../LiffBoot";

interface CalendarEvent {
  id: number;
  startDate: string;
  endDate: string;
  title: string;
  color: string;
  description: string;
  user: { id: string; name: string; picturePath: string | null };
}

const COLOR_CLASS: Record<string, string> = {
  blue: "border-sky-400 bg-sky-50",
  green: "border-emerald-400 bg-emerald-50",
  red: "border-rose-400 bg-rose-50",
  yellow: "border-amber-400 bg-amber-50",
  purple: "border-violet-400 bg-violet-50",
  orange: "border-orange-400 bg-orange-50",
  gray: "border-slate-300 bg-slate-50",
};

const DAY_LABEL = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTH_LABEL = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function formatDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatThaiDate(d: Date) {
  return `${DAY_LABEL[d.getDay()]} ${d.getDate()} ${MONTH_LABEL[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export default function LiffCalendarPage() {
  const { status } = useLiff();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "ready") return;
    const today = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 7);
    const from = formatDateKey(today);
    const to = formatDateKey(end);

    apiFetch<CalendarEvent[]>(`/calendar/events?from=${from}&to=${to}`)
      .then((d) => setEvents(Array.isArray(d) ? d : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [status]);

  // Group events by day (next 8 days: today + 7)
  const days: { date: Date; key: string; events: CalendarEvent[] }[] = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const key = formatDateKey(d);
    days.push({
      date: d,
      key,
      events: events.filter((e) => {
        const eventDate = new Date(e.startDate);
        return formatDateKey(eventDate) === key;
      }),
    });
  }

  const totalEvents = days.reduce((n, d) => n + d.events.length, 0);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <h1 className="mb-1 text-lg font-semibold">ปฏิทิน 7 วัน</h1>
      <p className="mb-4 text-xs text-slate-500">
        รวม {totalEvents} รายการ — ลงเวลา, ลา, ไปราชการ, ประชุม
      </p>

      {loading && <div className="text-center text-sm text-slate-500">กำลังโหลด…</div>}

      {!loading && (
        <div className="space-y-3">
          {days.map((d, idx) => (
            <section key={d.key}>
              <div className="mb-1.5 flex items-center justify-between">
                <h2
                  className={`text-sm font-semibold ${
                    idx === 0 ? "text-indigo-700" : "text-slate-700"
                  }`}
                >
                  {idx === 0 ? "วันนี้ · " : idx === 1 ? "พรุ่งนี้ · " : ""}
                  {formatThaiDate(d.date)}
                </h2>
                <span className="text-xs text-slate-400">{d.events.length} รายการ</span>
              </div>
              {d.events.length === 0 ? (
                <div className="rounded-lg bg-white p-3 text-center text-xs text-slate-400">
                  ว่าง
                </div>
              ) : (
                <div className="space-y-1.5">
                  {d.events.map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const isAllDay =
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    end.getHours() === 23 &&
    end.getMinutes() === 59;

  return (
    <div
      className={`rounded-lg border-l-4 bg-white p-2.5 shadow-sm ${
        COLOR_CLASS[event.color] ?? COLOR_CLASS.gray
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 text-sm font-medium text-slate-800">{event.title}</p>
        <span className="shrink-0 text-xs text-slate-500">
          {isAllDay
            ? "ทั้งวัน"
            : `${start.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`}
        </span>
      </div>
      {event.description && (
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{event.description}</p>
      )}
      {event.user?.name && (
        <p className="mt-1 text-xs text-slate-400">{event.user.name}</p>
      )}
    </div>
  );
}
