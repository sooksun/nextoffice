"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer, Pencil, Trash2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

const TYPE_LABEL: Record<string, string> = {
  sick: "ลาป่วย", personal: "ลากิจ", vacation: "ลาพักผ่อน",
  maternity: "ลาคลอด", ordination: "ลาบวช", training: "ลาศึกษาต่อ",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", pending: "รออนุมัติ", approved: "อนุมัติ",
  rejected: "ไม่อนุมัติ", cancelled: "ยกเลิก",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-mid text-on-surface-variant",
  pending: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  approved: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300",
  rejected: "bg-red-500/20 text-red-800 dark:text-red-300",
  cancelled: "bg-surface-mid text-on-surface-variant",
};

export interface LeaveRequest {
  id: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  reason?: string | null;
  createdAt: string;
  positionTitle?: string | null;
  contactPhone?: string | null;
  contactAddress?: string | null;
}

function formatDateTH(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear() + 543;
  return `${day}/${mon}/${year}`;
}

function RowActions({ row, onDeleted }: { row: LeaveRequest; onDeleted: (id: number) => void }) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const canEdit   = row.status === "draft";
  const canDelete = row.status === "draft" || row.status === "pending";

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try {
      await apiFetch(`/attendance/leave/${row.id}/cancel`, { method: "PATCH" });
      onDeleted(row.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "ไม่สามารถยกเลิกได้");
    } finally {
      setDeleting(false);
      setConfirmDel(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* Print */}
      <Link
        href={`/leave/${row.id}/print`}
        target="_blank"
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-on-surface-variant hover:bg-surface-low hover:text-primary transition-colors"
        title="พิมพ์ใบลา"
      >
        <Printer size={13} />
        <span className="hidden sm:inline">พิมพ์</span>
      </Link>

      {/* Edit — draft only */}
      {canEdit && (
        <Link
          href={`/leave/${row.id}/edit`}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-on-surface-variant hover:bg-surface-low hover:text-primary transition-colors"
          title="แก้ไขใบลา"
        >
          <Pencil size={13} />
          <span className="hidden sm:inline">แก้ไข</span>
        </Link>
      )}

      {/* Cancel / delete — draft or pending */}
      {canDelete && (
        deleting ? (
          <span className="inline-flex items-center px-2 py-1 text-xs text-error">
            <Loader2 size={12} className="animate-spin mr-1" /> ยกเลิก...
          </span>
        ) : confirmDel ? (
          <span className="inline-flex items-center gap-1">
            <button
              onClick={handleDelete}
              className="rounded-lg px-2 py-1 text-xs bg-error text-white hover:bg-error/90 transition-colors"
            >
              ยืนยันยกเลิก
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              className="rounded-lg px-2 py-1 text-xs text-on-surface-variant hover:bg-surface-low transition-colors"
            >
              ไม่
            </button>
          </span>
        ) : (
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-on-surface-variant hover:bg-surface-low hover:text-error transition-colors"
            title="ยกเลิกใบลา"
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">ยกเลิก</span>
          </button>
        )
      )}
    </div>
  );
}

export default function LeaveList({ initialRows }: { initialRows: LeaveRequest[] }) {
  const [rows, setRows] = useState(initialRows);

  function handleDeleted(id: number) {
    setRows((prev) =>
      prev.map((r) => r.id === id ? { ...r, status: "cancelled" } : r)
    );
  }

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-low border-b border-outline-variant/10">
          <tr>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ประเภท</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันที่</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วัน</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สถานะ</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">เหตุผล</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">การดำเนินการ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">
                ยังไม่มีใบลา
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-surface-low/50 transition-colors">
              <td className="px-4 py-3 font-medium">
                {TYPE_LABEL[r.leaveType] ?? r.leaveType}
              </td>
              <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                {formatDateTH(r.startDate)}
                {r.startDate !== r.endDate && <> – {formatDateTH(r.endDate)}</>}
              </td>
              <td className="px-4 py-3 text-xs">{Number(r.totalDays)} วัน</td>
              <td className="px-4 py-3">
                <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_COLOR[r.status] ?? "bg-surface-mid"}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-on-surface-variant max-w-[180px] truncate">
                {r.reason || "-"}
              </td>
              <td className="px-4 py-3">
                <RowActions row={r} onDeleted={handleDeleted} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
