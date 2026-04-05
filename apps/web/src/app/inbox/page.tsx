import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { Inbox, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const URGENCY_LABEL: Record<string, string> = {
  normal: "ทั่วไป",
  urgent: "ด่วน",
  very_urgent: "ด่วนมาก",
  most_urgent: "ด่วนที่สุด",
};
const URGENCY_COLOR: Record<string, string> = {
  normal: "bg-blue-100 text-blue-800",
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

interface InboxCase {
  id: number;
  title: string;
  registrationNo: string | null;
  status: string;
  urgencyLevel: string;
  receivedAt: string;
  dueDate: string | null;
  description: string | null;
  assignedTo: { id: number; fullName: string } | null;
  organization: { id: number; name: string } | null;
  sourceDocument: { id: number; issuingAuthority: string | null; documentCode: string | null } | null;
}

async function getCases(searchParams: Record<string, string>) {
  const params = new URLSearchParams();
  if (searchParams.search) params.set("search", searchParams.search);
  if (searchParams.dateFrom) params.set("dateFrom", searchParams.dateFrom);
  if (searchParams.dateTo) params.set("dateTo", searchParams.dateTo);
  params.set("take", "200");

  try {
    return await apiFetch<{ total: number; data: InboxCase[] }>(`/cases?${params}`);
  } catch {
    return { total: 0, data: [] };
  }
}

export default async function InboxPage({
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
            <Inbox size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">เอกสารเข้า</h1>
            <p className="text-xs text-on-surface-variant">พบ {total} รายการ</p>
          </div>
        </div>
        <Link
          href="/inbox/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95"
        >
          <Plus size={16} />
          รับเอกสารใหม่
        </Link>
      </div>

      {/* Search & Filter */}
      <form method="GET" className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          name="search"
          defaultValue={sp.search ?? ""}
          placeholder="ค้นหา..."
          className="input-text flex-1 min-w-[200px]"
        />
        <input type="date" name="dateFrom" defaultValue={sp.dateFrom ?? ""} className="input-date" />
        <input type="date" name="dateTo" defaultValue={sp.dateTo ?? ""} className="input-date" />
        <button type="submit" className="btn-primary">ค้นหา</button>
        <a href="/inbox" className="btn-ghost">ล้าง</a>
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left w-10">#</th>
              <th className="px-4 py-3 text-left w-24">เอกสาร</th>
              <th className="px-4 py-3 text-left">ชื่อเรื่อง</th>
              <th className="px-4 py-3 text-left">ที่</th>
              <th className="px-4 py-3 text-left">ผู้ส่ง</th>
              <th className="px-4 py-3 text-left">สถานะ</th>
              <th className="px-4 py-3 text-left">วันที่รับ</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                  ไม่พบเอกสาร
                </td>
              </tr>
            )}
            {data.map((c, i) => (
              <tr key={c.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                <td className="px-4 py-3 text-on-surface-variant">{i + 1}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${URGENCY_COLOR[c.urgencyLevel] ?? URGENCY_COLOR.normal}`}>
                    {URGENCY_LABEL[c.urgencyLevel] ?? c.urgencyLevel}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-md">
                  <Link href={`/inbox/${c.id}`} className="hover:text-primary hover:underline line-clamp-2 leading-relaxed font-medium">
                    {c.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                  {c.sourceDocument?.documentCode || c.registrationNo || "—"}
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">
                  {c.sourceDocument?.issuingAuthority || "—"}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-on-surface-variant">
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                  {new Date(c.receivedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
