"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatThaiDateShort } from "@/lib/thai-date";
import { ClipboardList } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";

const STATUS_LABEL: Record<string, string> = {
  pending: "รอพิจารณา",
  reviewing: "กำลังพิจารณา",
  approved: "อนุมัติ",
  rejected: "ไม่อนุมัติ",
  returned: "ส่งคืน",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  reviewing: "bg-blue-500/20 text-blue-800 dark:text-blue-300",
  approved: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300",
  rejected: "bg-red-500/20 text-red-800 dark:text-red-300",
  returned: "bg-orange-500/20 text-orange-800 dark:text-orange-300",
};

interface PresentationFile {
  id: number;
  title: string;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  sender: { id: number; fullName: string } | null;
}

export default function PresentationRegisterInPage() {
  const [items, setItems] = useState<PresentationFile[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode: "received" });
      if (status) params.set("status", status);
      const res = await apiFetch<{ total: number; data: PresentationFile[] }>(`/presentation?${params}`);
      setItems(res.data);
      setTotal(res.total);
    } catch {
      toastError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [status]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ClipboardList size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">ทะเบียนแฟ้มรับ</h1>
          <p className="text-xs text-on-surface-variant">รายการแฟ้มที่ได้รับทั้งหมด — พบ {total} รายการ</p>
        </div>
      </div>

      <div className="flex gap-3 mb-5">
        <select className="input-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-center w-12">ลำดับ</th>
              <th className="px-4 py-3 text-left">วันที่รับ</th>
              <th className="px-4 py-3 text-left">ชื่อแฟ้ม</th>
              <th className="px-4 py-3 text-left">ผู้ส่ง</th>
              <th className="px-4 py-3 text-left">วันที่พิจารณา</th>
              <th className="px-4 py-3 text-center">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">กำลังโหลด...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">ไม่พบข้อมูล</td></tr>
            )}
            {items.map((item, i) => (
              <tr key={item.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                <td className="px-4 py-3 text-center text-on-surface-variant text-xs">{i + 1}</td>
                <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">{formatThaiDateShort(item.submittedAt)}</td>
                <td className="px-4 py-3">
                  <span className="text-xs line-clamp-1">{item.title}</span>
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">{item.sender?.fullName ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                  {item.reviewedAt ? formatThaiDateShort(item.reviewedAt) : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold ${STATUS_COLOR[item.status] ?? STATUS_COLOR.pending}`}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
