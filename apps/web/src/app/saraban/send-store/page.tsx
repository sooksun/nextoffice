"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { BookMarked } from "lucide-react";
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
}

export default function SendStorePage() {
  const [docs, setDocs] = useState<RegistryDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getUser();
    const orgId = (user as any)?.organizationId || 1;
    apiFetch<RegistryDoc[]>(`/outbound/${orgId}/registry?type=outbound`)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
          <BookMarked size={20} className="text-secondary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">บัญชีหนังสือส่งเก็บ</h1>
          <p className="text-xs text-on-surface-variant">
            ตามระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ ข้อ ๕๗ — พบ {toThaiNumerals(docs.length)} รายการ
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
        <table className="w-full text-sm registry-table">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 text-center w-12">ลำดับที่</th>
              <th className="px-3 py-3 text-left">เลขที่</th>
              <th className="px-3 py-3 text-left">วันที่เก็บ</th>
              <th className="px-3 py-3 text-left">เรื่อง</th>
              <th className="px-3 py-3 text-left">เก็บที่แฟ้ม</th>
              <th className="px-3 py-3 text-left">วันหมดอายุ</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">กำลังโหลด...</td>
              </tr>
            )}
            {!loading && docs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">ไม่พบข้อมูล</td>
              </tr>
            )}
            {docs.map((d, i) => (
              <tr key={d.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                <td className="px-3 py-2 text-center text-on-surface-variant">{toThaiNumerals(i + 1)}</td>
                <td className="px-3 py-2 font-mono text-xs font-bold text-primary">
                  {d.documentNo ? toThaiNumerals(d.documentNo) : d.registryNo ? toThaiNumerals(d.registryNo) : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-on-surface-variant whitespace-nowrap">
                  {formatThaiDateShort(d.archivedAt)}
                </td>
                <td className="px-3 py-2 text-xs max-w-[240px] truncate">
                  {d.subject || "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {d.folder ? `${toThaiNumerals(d.folder.code)} ${d.folder.name}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-on-surface-variant">
                  {formatThaiDateShort(d.retentionEndDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
