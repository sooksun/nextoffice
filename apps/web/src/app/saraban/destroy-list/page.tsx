"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { Trash2 } from "lucide-react";
import { formatThaiDateShort, toThaiNumerals } from "@/lib/thai-date";

interface RegistryDoc {
  id: number;
  registryType: string;
  registryNo: string | null;
  documentNo: string | null;
  subject: string | null;
  fromOrg: string | null;
  toOrg: string | null;
  archivedAt: string | null;
  retentionEndDate: string | null;
  folder: { name: string; code: string } | null;
  destructionRequest?: {
    id: number;
    status: string;
    requestedBy: string;
    approvedBy: string | null;
    createdAt: string;
  } | null;
}

const DESTROY_STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  destroyed: "ทำลายแล้ว",
};
const DESTROY_STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  destroyed: "bg-red-100 text-red-800",
};

export default function DestroyListPage() {
  const [docs, setDocs] = useState<RegistryDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getUser();
    const orgId = (user as any)?.organizationId || 1;
    apiFetch<RegistryDoc[]>(`/outbound/${orgId}/registry?type=destroy`)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
          <Trash2 size={20} className="text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">บัญชีหนังสือขอทำลาย</h1>
          <p className="text-xs text-on-surface-variant">
            ตามระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ ข้อ ๖๖–๗๐ — พบ {toThaiNumerals(docs.length)} รายการ
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
        <table className="w-full text-sm registry-table">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 text-center w-12">ลำดับที่</th>
              <th className="px-3 py-3 text-left">เลขทะเบียน</th>
              <th className="px-3 py-3 text-left">เลขที่</th>
              <th className="px-3 py-3 text-left">เรื่อง</th>
              <th className="px-3 py-3 text-left">แฟ้ม</th>
              <th className="px-3 py-3 text-left">วันหมดอายุ</th>
              <th className="px-3 py-3 text-center">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">กำลังโหลด...</td>
              </tr>
            )}
            {!loading && docs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">ไม่พบรายการขอทำลาย</td>
              </tr>
            )}
            {docs.map((d, i) => (
              <tr key={d.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                <td className="px-3 py-2 text-center text-on-surface-variant">{toThaiNumerals(i + 1)}</td>
                <td className="px-3 py-2 font-mono text-xs font-bold text-primary">
                  {d.registryNo ? toThaiNumerals(d.registryNo) : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-on-surface-variant">
                  {d.documentNo ? toThaiNumerals(d.documentNo) : "—"}
                </td>
                <td className="px-3 py-2 text-xs max-w-[200px] truncate">
                  {d.subject || "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {d.folder ? `${toThaiNumerals(d.folder.code)} ${d.folder.name}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-on-surface-variant whitespace-nowrap">
                  {formatThaiDateShort(d.retentionEndDate)}
                </td>
                <td className="px-3 py-2 text-center">
                  {d.destructionRequest ? (
                    <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-semibold ${DESTROY_STATUS_COLOR[d.destructionRequest.status] ?? ""}`}>
                      {DESTROY_STATUS_LABEL[d.destructionRequest.status] ?? d.destructionRequest.status}
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-red-50 text-red-700">
                      รอดำเนินการ
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
