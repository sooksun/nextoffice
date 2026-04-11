"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { SendHorizontal, Plus, CheckCircle, Clock, Send, FileEdit } from "lucide-react";
import { formatThaiDateTime } from "@/lib/thai-date";

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  sent: "ส่งแล้ว",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-bright text-on-surface-variant border border-outline-variant/30",
  pending_approval: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  sent: "bg-green-100 text-green-800",
};
const URGENCY_LABEL: Record<string, string> = {
  normal: "ปกติ", urgent: "ด่วน", very_urgent: "ด่วนที่สุด", most_urgent: "ด่วนที่สุด",
};
const URGENCY_COLOR: Record<string, string> = {
  normal: "bg-blue-100 text-blue-800",
  urgent: "bg-yellow-100 text-yellow-800",
  very_urgent: "bg-orange-100 text-orange-800",
  most_urgent: "bg-red-100 text-red-800",
};

interface OutboundDoc {
  id: number;
  documentNo: string | null;
  subject: string;
  recipientOrg: string | null;
  urgencyLevel: string;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  createdBy: { id: number; fullName: string } | null;
  approvedBy: { id: number; fullName: string } | null;
}

export default function OutboundListPage() {
  const [docs, setDocs] = useState<OutboundDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [orgId, setOrgId] = useState<number | null>(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const oid = user.organizationId || 1;
    setOrgId(oid);
  }, []);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    const url = `/outbound/${orgId}/documents${filterStatus ? `?status=${filterStatus}` : ""}`;
    apiFetch<OutboundDoc[]>(url)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [orgId, filterStatus]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
            <SendHorizontal size={20} className="text-secondary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">หนังสือออก</h1>
            <p className="text-xs text-on-surface-variant">พบ {docs.length} รายการ</p>
          </div>
        </div>
        <Link
          href="/outbound/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95"
        >
          <Plus size={16} />
          สร้างหนังสือออก
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { value: "", label: "ทั้งหมด", icon: null },
          { value: "draft", label: "ร่าง", icon: FileEdit },
          { value: "pending_approval", label: "รออนุมัติ", icon: Clock },
          { value: "approved", label: "อนุมัติแล้ว", icon: CheckCircle },
          { value: "sent", label: "ส่งแล้ว", icon: Send },
        ].map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setFilterStatus(value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              filterStatus === value
                ? "bg-primary text-on-primary"
                : "bg-surface-bright text-on-surface-variant hover:bg-primary/10 hover:text-primary"
            }`}
          >
            {Icon && <Icon size={13} />}
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left w-10">#</th>
              <th className="px-4 py-3 text-left">เรื่อง</th>
              <th className="px-4 py-3 text-left">ถึง</th>
              <th className="px-4 py-3 text-left">เลขที่หนังสือ</th>
              <th className="px-4 py-3 text-left">ความเร่งด่วน</th>
              <th className="px-4 py-3 text-left">สถานะ</th>
              <th className="px-4 py-3 text-left">วันที่สร้าง</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {!loading && docs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                  ไม่พบเอกสาร
                </td>
              </tr>
            )}
            {docs.map((d, i) => (
              <tr key={d.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                <td className="px-4 py-3 text-on-surface-variant">{i + 1}</td>
                <td className="px-4 py-3 max-w-xs">
                  <Link href={`/outbound/${d.id}`} className="hover:text-primary hover:underline line-clamp-2 font-medium">
                    {d.subject}
                  </Link>
                  {d.createdBy && (
                    <p className="text-xs text-on-surface-variant mt-0.5">โดย {d.createdBy.fullName}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">{d.recipientOrg || "—"}</td>
                <td className="px-4 py-3 text-xs font-mono text-on-surface-variant">{d.documentNo || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${URGENCY_COLOR[d.urgencyLevel] ?? URGENCY_COLOR.normal}`}>
                    {URGENCY_LABEL[d.urgencyLevel] ?? d.urgencyLevel}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_COLOR[d.status] ?? ""}`}>
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                  {formatThaiDateTime(d.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
