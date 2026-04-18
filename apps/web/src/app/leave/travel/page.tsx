import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { formatThaiDateShort } from "@/lib/thai-date";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", pending: "รออนุมัติ", approved: "อนุมัติ", rejected: "ไม่อนุมัติ", cancelled: "ยกเลิก",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-mid text-on-surface-variant", pending: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  approved: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300", rejected: "bg-red-500/20 text-red-800 dark:text-red-300",
  cancelled: "bg-surface-mid text-on-surface-variant",
};

interface TravelRequest {
  id: number; travelDate: string; destination: string; purpose: string;
  status: string; departureTime: string | null; returnTime: string | null; createdAt: string;
}

async function getMyTravels(): Promise<TravelRequest[]> {
  try { return await apiFetch<TravelRequest[]>("/attendance/leave/travel/my-requests"); } catch { return []; }
}

export default async function TravelPage() {
  const requests = await getMyTravels();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center">
            <MapPin size={20} className="text-cyan-700" />
          </div>
          <h1 className="text-2xl font-black text-primary tracking-tight">ไปราชการ</h1>
        </div>
        <Link href="/leave/travel/new" className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> ขอไปราชการ
        </Link>
      </div>

      <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-low border-b border-outline-variant/10">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันที่</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ปลายทาง</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">เรื่อง</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">เวลา</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {requests.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-on-surface-variant">ยังไม่มีคำขอไปราชการ</td></tr>
            )}
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-surface-low transition-colors">
                <td className="px-4 py-3 text-xs whitespace-nowrap">{formatThaiDateShort(r.travelDate)}</td>
                <td className="px-4 py-3 font-medium max-w-xs truncate">{r.destination}</td>
                <td className="px-4 py-3 text-xs text-on-surface-variant max-w-xs truncate">{r.purpose}</td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">{r.departureTime ?? "-"} - {r.returnTime ?? "-"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_COLOR[r.status] ?? "bg-surface-mid"}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
