"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { Mail, Send, Settings } from "lucide-react";
import { formatThaiDateShort, formatThaiDateTime, toThaiNumerals } from "@/lib/thai-date";

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  sent: "ส่งแล้ว",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-bright text-on-surface-variant",
  pending_approval: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  sent: "bg-green-100 text-green-800",
};

interface OutboundDoc {
  id: number;
  documentNo: string | null;
  documentDate: string | null;
  subject: string;
  recipientName: string | null;
  recipientOrg: string | null;
  urgencyLevel: string;
  letterType: string;
  status: string;
  sentAt: string | null;
  sentMethod: string | null;
  createdBy: { id: number; fullName: string } | null;
}

const LETTER_TYPE_LABEL: Record<string, string> = {
  external_letter: "หนังสือภายนอก",
  internal_memo: "หนังสือภายใน",
  directive: "หนังสือสั่งการ",
  pr_letter: "หนังสือประชาสัมพันธ์",
  stamp_letter: "หนังสือประทับตรา",
  official_record: "หนังสือที่เจ้าหน้าที่ทำขึ้น",
  secret_letter: "หนังสือลับ",
};

export default function SarabanEmailPage() {
  const [docs, setDocs] = useState<OutboundDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<OutboundDoc[]>("/outbound/my/documents?status=sent")
      .then((all) => setDocs(all.filter((d) => d.sentMethod === "email")))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Mail size={20} className="text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">ไปรษณีย์อิเล็กทรอนิกส์ (saraban@)</h1>
            <p className="text-xs text-on-surface-variant">
              ตามระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ ฉ.๔ ข้อ ๒๙/๑ — พบ {toThaiNumerals(docs.length)} รายการที่ส่งผ่านอีเมล
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/outbound/new" className="btn-primary flex items-center gap-1.5">
            <Send size={14} /> ส่งหนังสือออก
          </Link>
          <Link href="/settings/line-accounts" className="btn-ghost flex items-center gap-1.5">
            <Settings size={14} /> ตั้งค่า SMTP
          </Link>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-2xl border border-blue-200/40 bg-blue-500/5 p-4 mb-5 flex gap-3">
        <Mail size={18} className="text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-on-surface-variant leading-relaxed">
          หน้านี้แสดงหนังสือออกที่ส่งผ่านระบบอีเมลของหน่วยงาน (sentMethod = email)
          การส่งหนังสือผ่านอีเมลใช้การตั้งค่า SMTP ขององค์กร —
          หากยังไม่ได้ตั้งค่า SMTP ติดต่อผู้ดูแลระบบที่เมนู <strong>ตั้งค่า</strong>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
        <table className="w-full text-sm registry-table">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 text-center w-12">ลำดับที่</th>
              <th className="px-3 py-3 text-left">ที่</th>
              <th className="px-3 py-3 text-left">ถึง</th>
              <th className="px-3 py-3 text-left">เรื่อง</th>
              <th className="px-3 py-3 text-left">ประเภท</th>
              <th className="px-3 py-3 text-left">วันที่ส่ง</th>
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
                <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">ยังไม่มีหนังสือที่ส่งผ่านอีเมล</td>
              </tr>
            )}
            {docs.map((d, i) => {
              const recipient = [d.recipientOrg, d.recipientName].filter(Boolean).join(" / ") || "—";
              return (
                <tr key={d.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                  <td className="px-3 py-2 text-center text-on-surface-variant">{toThaiNumerals(i + 1)}</td>
                  <td className="px-3 py-2 font-mono text-xs font-bold text-primary whitespace-nowrap">
                    {d.documentNo ? toThaiNumerals(d.documentNo) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant max-w-[140px] truncate" title={recipient}>
                    {recipient}
                  </td>
                  <td className="px-3 py-2 max-w-[240px]">
                    <a href={`/outbound/${d.id}`} className="hover:text-primary hover:underline line-clamp-2 text-xs">{d.subject}</a>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="px-2 py-0.5 rounded-lg bg-surface-bright text-on-surface-variant">
                      {LETTER_TYPE_LABEL[d.letterType] ?? d.letterType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant whitespace-nowrap">
                    {d.sentAt ? formatThaiDateTime(d.sentAt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-semibold ${STATUS_COLOR[d.status] ?? STATUS_COLOR.draft}`}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
