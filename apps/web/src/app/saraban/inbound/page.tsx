import { Suspense } from "react";
import { apiFetch } from "@/lib/api";
import { FileText } from "lucide-react";
import { formatThaiDateShort, formatThaiDateTime, toThaiNumerals } from "@/lib/thai-date";
import ThaiDateRangeFilter from "@/components/ui/ThaiDateRangeFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { UrgencyBadge, URGENCY_LABEL } from "@/components/status-badges";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่",
  analyzing: "วิเคราะห์",
  proposed: "เสนอ AI",
  registered: "ลงรับแล้ว",
  assigned: "มอบหมายแล้ว",
  in_progress: "กำลังดำเนินการ",
  completed: "เสร็จสิ้น",
  archived: "เก็บถาวร",
};

interface Assignment {
  assignedToUserId: number;
  role: string;
  status: string;
  assignedTo: { id: number; fullName: string } | null;
}

interface Case {
  id: number;
  title: string;
  registrationNo: string | null;
  status: string;
  urgencyLevel: string;
  receivedAt: string;
  dueDate: string | null;
  directorNote: string | null;
  documentNo?: string;
  documentDate?: string;
  assignedTo: { id: number; fullName: string } | null;
  organization: { id: number; name: string } | null;
  sourceDocument: {
    id: number;
    issuingAuthority: string | null;
    documentCode: string | null;
    publishedAt: string | null;
  } | null;
  assignments: Assignment[];
}

function buildActionSummary(c: Case): string {
  const parts: string[] = [];
  if (c.directorNote) {
    const note = c.directorNote.length > 40 ? c.directorNote.slice(0, 40) + "…" : c.directorNote;
    parts.push(note);
  }
  if (c.assignments?.length > 0) {
    const names = c.assignments
      .filter((a) => a.assignedTo)
      .map((a) => a.assignedTo!.fullName)
      .slice(0, 2);
    if (names.length > 0) {
      const suffix = c.assignments.length > 2 ? ` +${toThaiNumerals(c.assignments.length - 2)}` : "";
      parts.push(`มอบ ${names.join(", ")}${suffix}`);
    }
  }
  return parts.join(" / ") || "—";
}

async function getCases(searchParams: Record<string, string>) {
  const params = new URLSearchParams();
  if (searchParams.organizationId) params.set("organizationId", searchParams.organizationId);
  if (searchParams.status) params.set("status", searchParams.status);
  if (searchParams.urgencyLevel) params.set("urgencyLevel", searchParams.urgencyLevel);
  if (searchParams.dateFrom) params.set("dateFrom", searchParams.dateFrom);
  if (searchParams.dateTo) params.set("dateTo", searchParams.dateTo);
  if (searchParams.search) params.set("search", searchParams.search);
  params.set("take", "200");

  try {
    const res = await apiFetch<{ total: number; data: Case[] }>(`/cases?${params}`);
    return res;
  } catch {
    return { total: 0, data: [] };
  }
}

export default async function InboundRegistryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const { total, data } = await getCases(sp);
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight print-title">ทะเบียนรับ</h1>
            <p className="text-xs text-on-surface-variant no-print">
              แบบที่ ๑๒ ตามระเบียบสำนักนายกรัฐมนตรี — พบ {toThaiNumerals(total)} รายการ
            </p>
          </div>
        </div>
        <PrintButton />
      </div>

      {/* Filter bar */}
      <form method="GET" className="flex flex-wrap gap-3 mb-5 no-print items-center">
        <Input
          type="text"
          name="search"
          defaultValue={sp.search ?? ""}
          placeholder="ค้นหา..."
          className="flex-1 min-w-[200px]"
        />
        <NativeSelect name="status" defaultValue={sp.status ?? ""} className="w-40">
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </NativeSelect>
        <NativeSelect name="urgencyLevel" defaultValue={sp.urgencyLevel ?? ""} className="w-48">
          <option value="">ทุกชั้นความเร็ว</option>
          {Object.entries(URGENCY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </NativeSelect>
        <Suspense fallback={<div className="w-40 h-9 rounded-md bg-surface-bright animate-pulse" />}>
          <ThaiDateRangeFilter dateFrom={sp.dateFrom} dateTo={sp.dateTo} />
        </Suspense>
        <Button type="submit">กรอง</Button>
        <Button asChild variant="outline">
          <a href="/saraban/inbound">ล้าง</a>
        </Button>
      </form>

      {/* Table — แบบที่ 12 ทะเบียนรับ */}
      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm print-full">
        <table className="w-full text-sm registry-table">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 text-center w-12">ลำดับที่</th>
              <th className="px-3 py-3 text-left">วันที่รับ</th>
              <th className="px-3 py-3 text-left">เลขรับ</th>
              <th className="px-3 py-3 text-left">ที่</th>
              <th className="px-3 py-3 text-left">ลงวันที่</th>
              <th className="px-3 py-3 text-left">จาก</th>
              <th className="px-3 py-3 text-left">ถึง</th>
              <th className="px-3 py-3 text-left">เรื่อง</th>
              <th className="px-3 py-3 text-left">การปฏิบัติ</th>
              <th className="px-3 py-3 text-center">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-on-surface-variant">
                  ไม่พบข้อมูล
                </td>
              </tr>
            )}
            {data.map((c, i) => {
              const docDate = c.documentDate ?? c.sourceDocument?.publishedAt;
              return (
                <tr key={c.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                  <td className="px-3 py-2 text-center text-on-surface-variant">{toThaiNumerals(i + 1)}</td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant whitespace-nowrap">
                    {formatThaiDateTime(c.receivedAt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs font-bold text-primary whitespace-nowrap">
                    {c.registrationNo ? toThaiNumerals(c.registrationNo) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant whitespace-nowrap">
                    {c.documentNo ? toThaiNumerals(c.documentNo) : c.sourceDocument?.documentCode ? toThaiNumerals(c.sourceDocument.documentCode) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant whitespace-nowrap">
                    {formatThaiDateShort(docDate)}
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant max-w-[120px] truncate" title={c.sourceDocument?.issuingAuthority ?? ""}>
                    {c.sourceDocument?.issuingAuthority || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant max-w-[120px] truncate" title={c.organization?.name ?? ""}>
                    {c.organization?.name || "—"}
                  </td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <a href={`/inbox/${c.id}`} className="hover:text-primary hover:underline line-clamp-2 leading-relaxed text-xs">
                      {c.title}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-xs text-on-surface-variant max-w-[180px]">
                    <span className="line-clamp-2">{buildActionSummary(c)}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <UrgencyBadge level={c.urgencyLevel} className="text-[10px]" />
                    <br />
                    <span className="text-[10px] text-on-surface-variant">{STATUS_LABEL[c.status] ?? c.status}</span>
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
