"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { PackageOpen, Printer } from "lucide-react";
import { formatThaiDateShort, toThaiNumerals } from "@/lib/thai-date";

interface RegistryDoc {
  id: number;
  registryType: string;
  registryNo: string | null;
  documentNo: string | null;
  documentDate: string | null;
  subject: string | null;
  remarks: string | null;
  folder: { name: string; code: string } | null;
}

export default function DepositPage() {
  const [docs, setDocs] = useState<RegistryDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getUser();
    const orgId = user?.organizationId || 1;
    apiFetch<RegistryDoc[]>(`/outbound/${orgId}/registry?type=deposit`)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="print-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center no-print">
            <PackageOpen size={20} className="text-tertiary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight print-title">
              บัญชีฝากหนังสือ
            </h1>
            <p className="text-xs text-on-surface-variant">
              ตามระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ ข้อ ๖๐ (แบบที่ ๒๓) — พบ {toThaiNumerals(docs.length)} รายการ
            </p>
          </div>
        </div>
        <button onClick={() => window.print()} className="btn-ghost flex items-center gap-2 no-print">
          <Printer size={16} />
          <span className="text-sm">พิมพ์บัญชี</span>
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
        <table className="w-full text-sm registry-table">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 text-center w-12">ลำดับที่</th>
              <th className="px-3 py-3 text-left">รหัสแฟ้ม</th>
              <th className="px-3 py-3 text-left">ที่</th>
              <th className="px-3 py-3 text-left">ลงวันที่</th>
              <th className="px-3 py-3 text-left">เลขทะเบียนรับ</th>
              <th className="px-3 py-3 text-left">เรื่อง</th>
              <th className="px-3 py-3 text-left">หมายเหตุ</th>
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
                <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">ไม่พบรายการ</td>
              </tr>
            )}
            {docs.map((d, i) => (
              <tr key={d.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                <td className="px-3 py-2 text-center text-on-surface-variant">{toThaiNumerals(i + 1)}</td>
                <td className="px-3 py-2 text-xs">{d.folder ? toThaiNumerals(d.folder.code) : "—"}</td>
                <td className="px-3 py-2 font-mono text-xs font-bold text-primary">
                  {d.documentNo ? toThaiNumerals(d.documentNo) : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-on-surface-variant whitespace-nowrap">
                  {formatThaiDateShort(d.documentDate)}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-on-surface-variant">
                  {d.registryNo ? toThaiNumerals(d.registryNo) : "—"}
                </td>
                <td className="px-3 py-2 text-xs max-w-[240px] truncate">{d.subject || "—"}</td>
                <td className="px-3 py-2 text-xs text-on-surface-variant">{d.remarks || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
