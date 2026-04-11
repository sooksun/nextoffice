"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import ThaiDateInput from "@/components/ui/ThaiDateInput";

export default function NewTravelPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [travelDate, setTravelDate] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const td = (form.get("travelDate") as string) || travelDate;
    if (!td) { setError("กรุณาระบุวันที่ไปราชการ"); setLoading(false); return; }

    try {
      const travel = await apiFetch<{ id: number }>("/attendance/leave/travel", {
        method: "POST",
        body: JSON.stringify({
          travelDate: td,
          destination: form.get("destination"),
          purpose: form.get("purpose"),
          departureTime: form.get("departureTime") || null,
          returnTime: form.get("returnTime") || null,
        }),
      });

      // Auto-submit
      await apiFetch(`/attendance/leave/travel/${travel.id}/submit`, { method: "PATCH" });

      router.push("/leave/travel");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/leave/travel" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> กลับ
      </Link>

      <h1 className="text-xl font-black text-primary mb-6">ขออนุญาตไปราชการ</h1>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-xs font-bold text-on-surface-variant mb-1">วันที่ไปราชการ (พ.ศ.)</label>
          <ThaiDateInput name="travelDate" required onChange={setTravelDate} />
        </div>

        <div>
          <label className="block text-xs font-bold text-on-surface-variant mb-1">สถานที่ปลายทาง</label>
          <input type="text" name="destination" required className="input-text w-full" placeholder="เช่น สพป.นครพนม เขต 1" />
        </div>

        <div>
          <label className="block text-xs font-bold text-on-surface-variant mb-1">เรื่อง / วัตถุประสงค์</label>
          <textarea name="purpose" rows={3} required className="input-text w-full" placeholder="ระบุเรื่องที่ไปราชการ..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-on-surface-variant mb-1">เวลาออก</label>
            <input type="time" name="departureTime" className="input-text w-full" />
          </div>
          <div>
            <label className="block text-xs font-bold text-on-surface-variant mb-1">เวลากลับ</label>
            <input type="time" name="returnTime" className="input-text w-full" />
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
        )}

        <button type="submit" disabled={loading} className="w-full btn-primary flex items-center justify-center gap-2 py-3">
          <Send size={16} />
          {loading ? "กำลังส่ง..." : "ส่งคำขอไปราชการ"}
        </button>
      </form>
    </div>
  );
}
