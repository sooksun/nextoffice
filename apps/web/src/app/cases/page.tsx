import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { formatThaiDateShort } from "@/lib/thai-date";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่", analyzing: "วิเคราะห์", proposed: "เสนอ AI",
  registered: "ลงรับแล้ว", assigned: "มอบหมาย",
  in_progress: "ดำเนินการ", completed: "เสร็จสิ้น", archived: "เก็บถาวร",
};
const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-100 text-blue-800", analyzing: "bg-purple-100 text-purple-800",
  proposed: "bg-indigo-100 text-indigo-800", registered: "bg-cyan-100 text-cyan-800",
  assigned: "bg-yellow-100 text-yellow-800", in_progress: "bg-orange-100 text-orange-800",
  completed: "bg-green-100 text-green-800", archived: "bg-gray-100 text-gray-600",
};
const URGENCY_LABEL: Record<string, string> = {
  normal: "ทั่วไป", urgent: "ด่วน", very_urgent: "ด่วนมาก", most_urgent: "ด่วนที่สุด",
};

interface InboundCase {
  id: number;
  title: string;
  registrationNo: string | null;
  status: string;
  urgencyLevel: string;
  receivedAt: string;
  organization: { id: number; name: string } | null;
  assignedTo: { id: number; fullName: string } | null;
}

interface CasesResponse {
  total: number;
  data: InboundCase[];
}

async function getCases(): Promise<CasesResponse> {
  try {
    return await apiFetch<CasesResponse>("/cases?take=100");
  } catch {
    return { total: 0, data: [] };
  }
}

export default async function CasesPage() {
  const { total, data: cases } = await getCases();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-black text-primary tracking-tight">เคส</h1>
        <span className="text-sm text-on-surface-variant">{total} รายการ</span>
      </div>
      {cases.length === 0 ? (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center text-outline shadow-sm">
          ยังไม่มีเคส
        </div>
      ) : (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-low border-b border-outline-variant/10">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">เลขรับ</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">เรื่อง</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สถานะ</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ประเภท</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ผู้รับผิดชอบ</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันที่รับ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-surface-low transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/inbox/${c.id}`} className="text-primary hover:text-secondary font-mono text-xs font-bold">
                      {c.registrationNo ?? `#${c.id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <Link href={`/inbox/${c.id}`} className="text-on-surface hover:text-primary line-clamp-1">
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_COLOR[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs">{URGENCY_LABEL[c.urgencyLevel] ?? c.urgencyLevel}</td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs">{c.assignedTo?.fullName ?? "—"}</td>
                  <td className="px-4 py-3 text-outline text-xs">{formatThaiDateShort(c.receivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
