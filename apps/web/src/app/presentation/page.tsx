"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatThaiDateShort } from "@/lib/thai-date";
import { FolderKanban } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";
import Link from "next/link";

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
  description: string | null;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  sender: { id: number; fullName: string } | null;
  receiver: { id: number; fullName: string } | null;
  directorNote: string | null;
}

export default function PresentationPage() {
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

  async function handleUpdateStatus(id: number, newStatus: string) {
    try {
      await apiFetch(`/presentation/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      toastSuccess("อัปเดตสถานะสำเร็จ");
      fetchData();
    } catch {
      toastError("อัปเดตสถานะไม่สำเร็จ");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FolderKanban size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">รับแฟ้มนำเสนอ</h1>
            <p className="text-xs text-on-surface-variant">แฟ้มที่รอการพิจารณา — พบ {total} รายการ</p>
          </div>
        </div>
        <Link href="/presentation/send" className="btn-primary flex items-center gap-2">
          <FolderKanban size={16} /> ส่งแฟ้มนำเสนอ
        </Link>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-5">
        <select className="input-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="text-center py-10 text-on-surface-variant">กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-on-surface-variant">ไม่พบแฟ้มนำเสนอ</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold ${STATUS_COLOR[item.status] ?? STATUS_COLOR.pending}`}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                  <span className="text-xs text-on-surface-variant">{formatThaiDateShort(item.submittedAt)}</span>
                </div>
                <p className="font-semibold text-sm text-on-surface mb-1 line-clamp-1">{item.title}</p>
                {item.description && <p className="text-xs text-on-surface-variant line-clamp-2">{item.description}</p>}
                {item.directorNote && (
                  <p className="text-xs text-primary mt-1">หมายเหตุ: {item.directorNote}</p>
                )}
                <p className="text-xs text-on-surface-variant mt-1">จาก: {item.sender?.fullName ?? "—"}</p>
              </div>
              {item.status === "pending" && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleUpdateStatus(item.id, "approved")} className="btn-primary text-xs py-1.5 px-3">อนุมัติ</button>
                  <button onClick={() => handleUpdateStatus(item.id, "returned")} className="btn-ghost text-xs py-1.5 px-3">ส่งคืน</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
