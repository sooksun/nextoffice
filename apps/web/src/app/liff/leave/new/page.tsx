"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { useLiff } from "../../LiffBoot";

const LEAVE_TYPES = [
  { value: "sick", label: "ลาป่วย" },
  { value: "personal", label: "ลากิจ" },
  { value: "vacation", label: "ลาพักร้อน" },
  { value: "ordination", label: "ลาอุปสมบท" },
  { value: "training", label: "ลาฝึกอบรม" },
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string) {
  if (!a || !b) return 0;
  const d1 = new Date(a);
  const d2 = new Date(b);
  const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 0;
}

export default function LiffLeaveNewPage() {
  const { status } = useLiff();
  const router = useRouter();

  const [leaveType, setLeaveType] = useState("sick");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const totalDays = daysBetween(startDate, endDate);

  const handleSubmit = async () => {
    if (!startDate || !endDate) return toast.error("กรุณาเลือกวันลา");
    if (totalDays <= 0) return toast.error("วันที่สิ้นสุดต้องไม่น้อยกว่าวันเริ่ม");
    if (!reason.trim()) return toast.error("กรุณาระบุเหตุผล");

    setSubmitting(true);
    try {
      // Create + submit (2-step to match existing API)
      const created = await apiFetch<{ id: number }>("/attendance/leave", {
        method: "POST",
        body: JSON.stringify({
          leaveType,
          startDate,
          endDate,
          totalDays,
          reason,
          contactPhone: contactPhone || undefined,
        }),
      });
      await apiFetch(`/attendance/leave/${created.id}/submit`, {
        method: "PATCH",
        body: "{}",
      });
      toast.success("ส่งใบลาเรียบร้อย รอการอนุมัติ");
      router.push("/liff/leave");
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
        href="/liff/leave"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500"
      >
        ← กลับ
      </Link>

      <h1 className="mb-4 text-lg font-semibold">ขอลาใหม่</h1>

      <div className="space-y-3">
        {/* Leave type */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-semibold">ประเภทการลา</label>
          <div className="grid grid-cols-2 gap-2">
            {LEAVE_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setLeaveType(t.value)}
                className={`rounded-lg border py-2 text-sm ${
                  leaveType === t.value
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-semibold">วันที่ลา</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500">ตั้งแต่</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">ถึง</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-emerald-700">รวม {totalDays} วัน</p>
        </div>

        {/* Reason */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-semibold">เหตุผล</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="เช่น ไข้สูง ต้องพักผ่อน..."
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Contact */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-semibold">
            เบอร์ติดต่อระหว่างลา <span className="text-xs font-normal text-slate-400">(ไม่จำเป็น)</span>
          </label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="08x-xxx-xxxx"
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Submit */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            onClick={handleSubmit}
            disabled={submitting || totalDays <= 0 || !reason.trim()}
            className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "กำลังส่ง…" : "ส่งใบลา"}
          </button>
        </div>
      </div>
    </div>
  );
}
