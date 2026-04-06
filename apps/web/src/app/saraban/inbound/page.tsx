import { apiFetch } from "@/lib/api";
import { FileText } from "lucide-react";
import { formatThaiDateShort } from "@/lib/thai-date";

export const dynamic = "force-dynamic";

const URGENCY_LABEL: Record<string, string> = {
  normal: "ปกติ",
  urgent: "ด่วน",
  very_urgent: "ด่วนมาก",
  most_urgent: "ด่วนที่สุด",
};
const URGENCY_COLOR: Record<string, string> = {
  normal: "bg-surface-bright text-on-surface-variant",
  urgent: "bg-yellow-100 text-yellow-800",
  very_urgent: "bg-orange-100 text-orange-800",
  most_urgent: "bg-red-100 text-red-800",
};
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

interface Case {
  id: number;
  title: string;
  registrationNo: string | null;
  status: string;
  urgencyLevel: string;
  receivedAt: string;
  dueDate: string | null;
  assignedTo: { id: number; fullName: string } | null;
  organization: { id: number; name: string } | null;
  sourceDocument: { id: number; issuingAuthority: string | null; documentCode: string | null } | null;
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
  const now = new Date();

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <FileText size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">ทะเบียนรับ</h1>
          <p className="text-xs text-on-surface-variant">พบ {total} รายการ</p>
        </div>
      </div>

      {/* Filter bar */}
      <form method="GET" className="flex flex-wrap gap-3 mb-5">
        <input type="text" name="search" defaultValue={sp.search ?? ""} placeholder="ค้นหา..." className="input-text flex-1 min-w-[200px]" />
        <select name="status" defaultValue={sp.status ?? ""} className="input-select">
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select name="urgencyLevel" defaultValue={sp.urgencyLevel ?? ""} className="input-select">
          <option value="">ทุกชั้นความเร็ว</option>
          {Object.entries(URGENCY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <input type="date" name="dateFrom" defaultValue={sp.dateFrom ?? ""} className="input-date" />
        <input type="date" name="dateTo" defaultValue={sp.dateTo ?? ""} className="input-date" />
        <button type="submit" className="btn-primary">กรอง</button>
        <a href="/saraban/inbound" className="btn-ghost">ล้าง</a>
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">เอกสาร</th>
              <th className="px-4 py-3 text-left">เลขรับ</th>
              <th className="px-4 py-3 text-left">เรื่อง</th>
              <th className="px-4 py-3 text-left">ที่</th>
              <th className="px-4 py-3 text-left">ผู้ส่ง</th>
              <th className="px-4 py-3 text-left">สถานะ</th>
              <th className="px-4 py-3 text-left">วันที่รับ</th>
              <th className="px-4 py-3 text-left">ผู้รับผิดชอบ</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-on-surface-variant">
                  ไม่พบข้อมูล
                </td>
              </tr>
            )}
            {data.map((c, i) => {
              const isOverdue = c.dueDate && new Date(c.dueDate) < now && !["completed", "archived"].includes(c.status);
              return (
                <tr key={c.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                  <td className="px-4 py-3 text-on-surface-variant">{i + 1}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${URGENCY_COLOR[c.urgencyLevel] ?? URGENCY_COLOR.normal}`}>
                      {URGENCY_LABEL[c.urgencyLevel] ?? c.urgencyLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{c.registrationNo ?? "—"}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <a href={`/inbox/${c.id}`} className="hover:text-primary hover:underline line-clamp-2 leading-relaxed">
                      {c.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                    {c.sourceDocument?.documentCode || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">
                    {c.sourceDocument?.issuingAuthority || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-on-surface-variant">{STATUS_LABEL[c.status] ?? c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                    {formatThaiDateShort(c.receivedAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">{c.assignedTo?.fullName ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
