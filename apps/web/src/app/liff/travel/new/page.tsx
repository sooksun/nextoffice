"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { useLiff } from "../../LiffBoot";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function LiffTravelNewPage() {
  const { status } = useLiff();
  const router = useRouter();

  const [travelDate, setTravelDate] = useState(todayISO());
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [departureTime, setDepartureTime] = useState("08:00");
  const [returnTime, setReturnTime] = useState("17:00");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!destination.trim()) return toast.error("กรุณาระบุสถานที่ไปราชการ");
    if (!purpose.trim()) return toast.error("กรุณาระบุวัตถุประสงค์");

    setSubmitting(true);
    try {
      const created = await apiFetch<{ id: number }>("/attendance/leave/travel", {
        method: "POST",
        body: JSON.stringify({
          travelDate,
          destination,
          purpose,
          departureTime,
          returnTime,
        }),
      });
      await apiFetch(`/attendance/leave/travel/${created.id}/submit`, {
        method: "PATCH",
        body: "{}",
      });
      toast.success("ส่งคำขอไปราชการเรียบร้อย");
      router.push("/liff/travel");
    } catch (e: any) {
      toast.error(e.message ?? "ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  if (status !== "ready") {
    return <div className="p-6 text-center text-sm text-slate-500">กำลังโหลด…</div>;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-4 pb-28">
      <Link
        href="/liff/travel"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500"
      >
        ← กลับ
      </Link>

      <h1 className="mb-4 text-lg font-semibold">ขอไปราชการ</h1>

      <div className="space-y-3">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <label className="mb-1 block text-sm font-semibold">วันที่</label>
          <input
            type="date"
            value={travelDate}
            onChange={(e) => setTravelDate(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm">
          <label className="mb-1 block text-sm font-semibold">สถานที่</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="เช่น สพป.เชียงราย เขต 2"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm">
          <label className="mb-1 block text-sm font-semibold">วัตถุประสงค์</label>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            rows={3}
            placeholder="เช่น เข้าร่วมประชุมคณะกรรมการ..."
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-semibold">เวลาเดินทาง</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500">ออก</label>
              <input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">กลับ</label>
              <input
                type="time"
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            onClick={handleSubmit}
            disabled={submitting || !destination.trim() || !purpose.trim()}
            className="w-full rounded-lg bg-cyan-600 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "กำลังส่ง…" : "ส่งคำขอ"}
          </button>
        </div>
      </div>
    </div>
  );
}
