"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { Archive, AlertTriangle } from "lucide-react";
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

const REGISTRY_TYPE_LABEL: Record<string, string> = {
  inbound: "หนังสือรับ",
  outbound: "หนังสือส่ง",
  archive: "เก็บถาวร",
};

function isExpiringSoon(date: string | null): boolean {
  if (!date) return false;
  const diff = (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff <= 30;
}

export default function StoredRegisterPage() {
  const [docs, setDocs] = useState<RegistryDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getUser();
    const orgId = (user as any)?.organizationId || 1;
    apiFetch<RegistryDoc[]>(`/outbound/${orgId}/registry?type=archive`)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center">
          <Archive size={20} className="text-tertiary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">ทะเบียนหนังสือเก็บ</h1>
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
              <th className="px-3 py-3 text-left">เลขทะเบียน</th>
              <th className="px-3 py-3 text-left">เลขที่</th>
              <th className="px-3 py-3 text-left">ประเภท</th>
              <th className="px-3 py-3 text-left">เรื่อง</th>
              <th className="px-3 py-3 text-left">แฟ้ม</th>
              <th className="px-3 py-3 text-left">วันที่เก็บ</th>
              <th className="px-3 py-3 text-left">ครบกำหนด</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-on-surface-variant">กำลังโหลด...</td>
              </tr>
            )}
            {!loading && docs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-on-surface-variant">ไม่พบข้อมูล</td>
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
                <td className="px-3 py-2 text-xs">
                  <span className="px-2 py-0.5 rounded-lg bg-surface-bright text-on-surface-variant font-medium">
                    {REGISTRY_TYPE_LABEL[d.registryType] ?? d.registryType}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs max-w-[200px] truncate">
                  {d.subject || "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {d.folder ? `${toThaiNumerals(d.folder.code)} ${d.folder.name}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-on-surface-variant whitespace-nowrap">
                  {formatThaiDateShort(d.archivedAt)}
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {d.retentionEndDate ? (
                    <span className={isExpiringSoon(d.retentionEndDate) ? "text-red-600 font-semibold" : "text-on-surface-variant"}>
                      {isExpiringSoon(d.retentionEndDate) && <AlertTriangle size={12} className="inline mr-1" />}
                      {formatThaiDateShort(d.retentionEndDate)}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
