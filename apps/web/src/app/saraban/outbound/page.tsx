import { Suspense } from "react";
import { apiFetch, getServerToken } from "@/lib/api";
import Link from "next/link";
import { Send } from "lucide-react";
import { formatThaiDateShort } from "@/lib/thai-date";
import ThaiDateRangeFilter from "@/components/ui/ThaiDateRangeFilter";

export const dynamic = "force-dynamic";

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
const URGENCY_LABEL: Record<string, string> = {
  normal: "ทั่วไป",
  urgent: "ด่วน",
  very_urgent: "ด่วนที่สุด",
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
  secret_letter:   "หนังสือลับ",
};

interface OutboundDoc {
  id: number;
  documentNo: string | null;
  documentDate: string | null;
  subject: string;
  recipientOrg: string | null;
  urgencyLevel: string;
  securityLevel: string;
  letterType: string;
  status: string;
  sentAt: string | null;
  createdBy: { id: number; fullName: string } | null;
}

async function getDocs(orgId: string, status?: string, letterType?: string, roleCode?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (letterType) params.set("letterType", letterType);
  if (roleCode) params.set("roleCode", roleCode);
  const qs = params.toString() ? `?${params.toString()}` : "";
  try {
    return await apiFetch<OutboundDoc[]>(`/outbound/${orgId}/documents${qs}`);
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
  const orgId = sp.organizationId ?? "1";
  const letterType = sp.type;

  // Get user role from server token for filtering
  let roleCode: string | undefined;
  try {
    const token = await getServerToken();
    if (token) {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
      roleCode = payload.roleCode;
    }
  } catch { /* ignore */ }

  const docs = await getDocs(orgId, sp.status, letterType, roleCode);

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
            <h1 className="text-2xl font-black text-primary tracking-tight">{pageTitle}</h1>
            <p className="text-xs text-on-surface-variant">พบ {docs.length} รายการ</p>
          </div>
        </div>
      </div>

      {/* Letter type tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
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
      <form method="GET" className="flex flex-wrap gap-3 mb-5">
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

      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">ลำดับ</th>
              <th className="px-4 py-3 text-left">เลขที่หนังสือ</th>
              <th className="px-4 py-3 text-left">เรื่อง</th>
              <th className="px-4 py-3 text-left">ถึง</th>
              <th className="px-4 py-3 text-left">ประเภท</th>
              <th className="px-4 py-3 text-left">ชั้นความเร็ว</th>
              <th className="px-4 py-3 text-left">สถานะ</th>
              <th className="px-4 py-3 text-left">วันที่ส่ง</th>
              <th className="px-4 py-3 text-left">ผู้สร้าง</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-on-surface-variant">ไม่พบข้อมูล</td>
              </tr>
            )}
            {docs.map((d, i) => (
              <tr key={d.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                <td className="px-4 py-3 text-on-surface-variant">{i + 1}</td>
                <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{d.documentNo ?? "—"}</td>
                <td className="px-4 py-3 max-w-xs">
                  <a href={`/outbound/${d.id}`} className="hover:text-primary hover:underline line-clamp-2">{d.subject}</a>
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">{d.recipientOrg ?? "—"}</td>
                <td className="px-4 py-3 text-xs">
                  <span className={`px-2 py-0.5 rounded-lg font-medium ${d.letterType === "secret_letter" ? "bg-red-50 text-red-700" : "bg-surface-bright text-on-surface-variant"}`}>
                    {d.letterType === "secret_letter" ? "🔒 " : ""}{LETTER_TYPE_LABEL[d.letterType] ?? d.letterType}
                  </span>
                </td>
                <td className={`px-4 py-3 text-xs ${URGENCY_COLOR[d.urgencyLevel] ?? ""}`}>
                  {URGENCY_LABEL[d.urgencyLevel] ?? d.urgencyLevel}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_COLOR[d.status] ?? STATUS_COLOR.draft}`}>
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                  {d.sentAt ? formatThaiDateShort(d.sentAt) : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">{d.createdBy?.fullName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
