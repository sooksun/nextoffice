import { Suspense } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { Send } from "lucide-react";
import { formatThaiDateShort, toThaiNumerals } from "@/lib/thai-date";
import ThaiDateRangeFilter from "@/components/ui/ThaiDateRangeFilter";
import PrintButton from "../inbound/PrintButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  sent: "ส่งแล���ว",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-bright text-on-surface-variant",
  pending_approval: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  sent: "bg-green-100 text-green-800",
};
const URGENCY_LABEL: Record<string, string> = {
  normal: "ปกติ",
  urgent: "ด่วน",
  very_urgent: "ด่วนมาก",
  most_urgent: "ด่วนที่สุด",
};
const URGENCY_COLOR: Record<string, string> = {
  normal: "",
  urgent: "text-yellow-700 font-semibold",
  very_urgent: "text-orange-700 font-semibold",
  most_urgent: "text-red-700 font-semibold",
};
const LETTER_TYPE_LABEL: Record<string, string> = {
  external_letter: "หนังสือภายนอก",
  internal_memo:   "หนังสือภายใน",
  directive:       "หนังสือสั่งการ",
  pr_letter:       "หนังสือประชาสัมพันธ์",
  official_record: "หนังสือที่เจ้าหน้าที่ทำขึ้น",
  stamp_letter:    "หนังสือประทับตรา",
  secret_letter:   "หนังสือลับ",
};
const SENT_METHOD_LABEL: Record<string, string> = {
  email: "อีเมล",
  line: "LINE",
  paper: "ส่งเอกสาร",
};

interface OutboundDoc {
  id: number;
  documentNo: string | null;
  documentDate: string | null;
  subject: string;
  recipientName: string | null;
  recipientOrg: string | null;
  urgencyLevel: string;
  securityLevel: string;
  letterType: string;
  status: string;
  sentAt: string | null;
  sentMethod: string | null;
  createdBy: { id: number; fullName: string } | null;
  organization: { id: number; name: string; shortName: string | null } | null;
}

async function getDocs(status?: string, letterType?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (letterType) params.set("letterType", letterType);
  const qs = params.toString() ? `?${params.toString()}` : "";
  try {
    // ใช้ /outbound/my/documents — backend อ่าน orgId จาก JWT (ไม่ต้องส่งใน URL)
    return await apiFetch<OutboundDoc[]>(`/outbound/my/documents${qs}`);
  } catch {
    return [];
  }
}

export default async function OutboundRegistryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const letterType = sp.type;

  const docs = await getDocs(sp.status, letterType);

  const pageTitle = letterType
    ? `ทะเบียนส่ง — ${LETTER_TYPE_LABEL[letterType] ?? letterType}`
    : "ทะเบียนส่ง";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
            <Send size={20} className="text-secondary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight print-title">{pageTitle}</h1>
            <p className="text-xs text-on-surface-variant no-print">
              แบบที่ ๑๓ ตามระเบียบสำนักนายกรัฐมนตรี — พบ {toThaiNumerals(docs.length)} รายการ
            </p>
          </div>
        </div>
        <PrintButton />
      </div>

      {/* Letter type tabs */}
      <div className="flex flex-wrap gap-2 mb-4 no-print">
        <Link
          href="/saraban/outbound"
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${!letterType ? "bg-primary text-on-primary" : "bg-surface-bright text-on-surface-variant hover:text-primary"}`}
        >
          ทั้งหมด
        </Link>
        {Object.entries(LETTER_TYPE_LABEL).map(([v, l]) => (
          <Link
            key={v}
            href={`/saraban/outbound?type=${v}`}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              letterType === v
                ? v === "secret_letter"
                  ? "bg-red-600 text-white"
                  : "bg-primary text-on-primary"
                : v === "secret_letter"
                ? "bg-red-50 text-red-700 hover:bg-red-100"
                : "bg-surface-bright text-on-surface-variant hover:text-primary"
            }`}
          >
            {v === "secret_letter" ? "🔒 " : ""}{l}
          </Link>
        ))}
      </div>

      {/* Status + date filter */}
      <form method="GET" className="flex flex-wrap gap-3 mb-5 no-print">
        {letterType && <input type="hidden" name="type" value={letterType} />}
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
        <a href={letterType ? `/saraban/outbound?type=${letterType}` : "/saraban/outbound"} className="btn-ghost">ล้าง</a>
      </form>

      {/* Table — แบบที่ 13 ทะเบียนส่ง */}
      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm print-full">
        <table className="w-full text-sm registry-table">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 text-center w-12">ลำดับที่</th>
              <th className="px-3 py-3 text-left">ที่</th>
              <th className="px-3 py-3 text-left">ลงวันที่</th>
              <th className="px-3 py-3 text-left">จาก</th>
              <th className="px-3 py-3 text-left">ถึง</th>
              <th className="px-3 py-3 text-left">เรื่อง</th>
              <th className="px-3 py-3 text-left">ประเภท</th>
              <th className="px-3 py-3 text-center">ชั้นความเร็ว</th>
              <th className="px-3 py-3 text-center">สถานะ</th>
              <th className="px-3 py-3 text-left">การปฏิบัติ</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-on-surface-variant">ไม่พบข้อมูล</td>
              </tr>
            )}
            {docs.map((d, i) => {
              const recipient = [d.recipientOrg, d.recipientName].filter(Boolean).join(" / ") || "—";
              const actionParts: string[] = [];
              if (d.sentAt) actionParts.push(`ส่งแล้ว ${formatThaiDateShort(d.sentAt)}`);
              if (d.sentMethod) actionParts.push(SENT_METHOD_LABEL[d.sentMethod] ?? d.sentMethod);
              const actionText = actionParts.join(" — ") || "—";

              return (
                <tr key={d.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                  <td className="px-3 py-2 text-center text-on-surface-variant">{toThaiNumerals(i + 1)}</td>
                  <td className="px-3 py-2 font-mono text-xs font-bold text-primary whitespace-nowrap">
                    {d.documentNo ? toThaiNumerals(d.documentNo) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant whitespace-nowrap">
                    {formatThaiDateShort(d.documentDate)}
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant max-w-[120px] truncate" title={d.organization?.name ?? ""}>
                    {d.organization?.shortName || d.organization?.name || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant max-w-[140px] truncate" title={recipient}>
                    {recipient}
                  </td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <a href={`/outbound/${d.id}`} className="hover:text-primary hover:underline line-clamp-2 text-xs">{d.subject}</a>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-lg font-medium ${d.letterType === "secret_letter" ? "bg-red-50 text-red-700" : "bg-surface-bright text-on-surface-variant"}`}>
                      {d.letterType === "secret_letter" ? "🔒 " : ""}{LETTER_TYPE_LABEL[d.letterType] ?? d.letterType}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-xs text-center ${URGENCY_COLOR[d.urgencyLevel] ?? ""}`}>
                    {URGENCY_LABEL[d.urgencyLevel] ?? d.urgencyLevel}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-semibold ${STATUS_COLOR[d.status] ?? STATUS_COLOR.draft}`}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant max-w-[140px]">
                    <span className="line-clamp-2">{actionText}</span>
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
