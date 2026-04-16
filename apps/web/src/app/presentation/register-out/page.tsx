"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatThaiDateShort } from "@/lib/thai-date";
import { Send } from "lucide-react";
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
  pending: "bg-yellow-100 text-yellow-800",
  reviewing: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  returned: "bg-orange-100 text-orange-800",
};

interface PresentationFile {
  id: number;
  title: string;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  receiver: { id: number; fullName: string } | null;
  directorNote: string | null;
}

export default function PresentationRegisterOutPage() {
  const [items, setItems] = useState<PresentationFile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await apiFetch<{ total: number; data: PresentationFile[] }>(`/presentation?mode=sent`);
      setItems(res.data);
      setTotal(res.total);
    } catch {
      toastError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Send size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">ทะเบียนแฟ้มส่ง</h1>
            <p className="text-xs text-on-surface-variant">รายการแฟ้มที่ส่งออกทั้งหมด — พบ {total} รายการ</p>
          </div>
        </div>
        <Link href="/presentation/send" className="btn-primary flex items-center gap-2">
          <Send size={16} /> ส่งแฟ้มใหม่
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-center w-12">ลำดับ</th>
              <th className="px-4 py-3 text-left">วันที่ส่ง</th>
              <th className="px-4 py-3 text-left">ชื่อแฟ้ม</th>
              <th className="px-4 py-3 text-left">ผู้รับ</th>
              <th className="px-4 py-3 text-left">หมายเหตุ</th>
              <th className="px-4 py-3 text-center">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">กำลังโหลด...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">ยังไม่มีการส่งแฟ้ม</td></tr>
            )}
            {items.map((item, i) => (
              <tr key={item.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                <td className="px-4 py-3 text-center text-on-surface-variant text-xs">{i + 1}</td>
                <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">{formatThaiDateShort(item.submittedAt)}</td>
                <td className="px-4 py-3">
                  <span className="text-xs line-clamp-1">{item.title}</span>
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">{item.receiver?.fullName ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-on-surface-variant max-w-[160px]">
                  <span className="line-clamp-1">{item.directorNote ?? "—"}</span>
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
