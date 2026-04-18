import { Suspense } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { FileInput, Plus } from "lucide-react";
import { formatThaiDateShort, toThaiNumerals } from "@/lib/thai-date";
import ThaiDateRangeFilter from "@/components/ui/ThaiDateRangeFilter";
import PrintButton from "../inbound/PrintButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  sent: "ส่งแล้ว",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-bright text-on-surface-variant",
  pending_approval: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  approved: "bg-blue-500/20 text-blue-800 dark:text-blue-300",
  sent: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300",
};
const URGENCY_LABEL: Record<string, string> = {
  normal: "ปกติ",
  urgent: "ด่วน",
  very_urgent: "ด่วนมาก",
  most_urgent: "ด่วนที่สุด",
};
const URGENCY_COLOR: Record<string, string> = {
  normal: "",
  urgent: "text-amber-700 dark:text-amber-300 font-semibold",
  very_urgent: "text-orange-700 dark:text-orange-300 font-semibold",
  most_urgent: "text-red-700 dark:text-red-300 font-semibold",
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
  createdBy: { id: number; fullName: string } | null;
  organization: { id: number; name: string; shortName: string | null } | null;
}

async function getDocs(status?: string) {
  const params = new URLSearchParams({ letterType: "internal_memo" });
  if (status) params.set("status", status);
  try {
    return await apiFetch<OutboundDoc[]>(`/outbound/my/documents?${params}`);
  } catch {
    return [];
  }
}

export default async function MemoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const docs = await getDocs(sp.status);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
            <FileInput size={20} className="text-secondary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight print-title">หนังสือภายใน (บันทึกข้อความ)</h1>
            <p className="text-xs text-on-surface-variant no-print">
              ตามระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ ข้อ ๑๓ — พบ {toThaiNumerals(docs.length)} รายการ
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 no-print">
          <PrintButton />
          <Link href="/outbound/new" className="btn-primary flex items-center gap-1.5">
            <Plus size={14} /> สร้างบันทึกข้อความ
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <form method="GET" className="flex flex-wrap gap-3 mb-5 no-print">
        <select name="status" defaultValue={sp.status ?? ""} className="input-select">
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <Suspense fallback={<div className="w-40 h-9 rounded-xl bg-surface-bright animate-pulse" />}>
          <ThaiDateRangeFilter dateFrom={sp.dateFrom} dateTo={sp.dateTo} />
        </Suspense>
        <button type="submit" className="btn-primary">กรอง</button>
        <a href="/saraban/memo" className="btn-ghost">ล้าง</a>
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm print-full">
        <table className="w-full text-sm registry-table">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 text-center w-12">ลำดับที่</th>
              <th className="px-3 py-3 text-left">ที่</th>
              <th className="px-3 py-3 text-left">ลงวันที่</th>
              <th className="px-3 py-3 text-left">ถึง</th>
              <th className="px-3 py-3 text-left">เรื่อง</th>
              <th className="px-3 py-3 text-center">ชั้นความเร็ว</th>
              <th className="px-3 py-3 text-center">สถานะ</th>
              <th className="px-3 py-3 text-left">ผู้สร้าง</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-on-surface-variant">ไม่พบข้อมูล</td>
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
                  <td className="px-3 py-2 text-xs text-on-surface-variant whitespace-nowrap">
                    {formatThaiDateShort(d.documentDate)}
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant max-w-[140px] truncate" title={recipient}>
                    {recipient}
                  </td>
                  <td className="px-3 py-2 max-w-[240px]">
                    <a href={`/outbound/${d.id}`} className="hover:text-primary hover:underline line-clamp-2 text-xs">{d.subject}</a>
                  </td>
                  <td className={`px-3 py-2 text-xs text-center ${URGENCY_COLOR[d.urgencyLevel] ?? ""}`}>
                    {URGENCY_LABEL[d.urgencyLevel] ?? d.urgencyLevel}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-semibold ${STATUS_COLOR[d.status] ?? STATUS_COLOR.draft}`}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant">
                    {d.createdBy?.fullName ?? "—"}
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
