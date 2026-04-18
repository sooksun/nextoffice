import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  checked_in: "เข้าแล้ว", checked_out: "ออกแล้ว", late: "สาย",
  absent: "ขาด", leave: "ลา", travel: "ไปราชการ",
};
const STATUS_COLOR: Record<string, string> = {
  checked_in: "bg-blue-500/20 text-blue-800 dark:text-blue-300", checked_out: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300",
  late: "bg-orange-500/20 text-orange-800 dark:text-orange-300", absent: "bg-red-500/20 text-red-800 dark:text-red-300",
  leave: "bg-purple-500/20 text-purple-800 dark:text-purple-300", travel: "bg-cyan-100 text-cyan-800",
};

interface AttendanceRecord {
  id: number; date: string; status: string;
  checkInAt: string | null; checkOutAt: string | null; geofenceValid: boolean;
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

async function getHistory(month?: string, year?: string): Promise<AttendanceRecord[]> {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (year) params.set("year", year);
  try { return await apiFetch<AttendanceRecord[]>(`/attendance/history?${params}`); } catch { return []; }
}

export default async function AttendanceHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const month = sp.month || String(now.getMonth() + 1);
  const year = sp.year || String(now.getFullYear());
  const records = await getHistory(month, year);

  const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

  return (
    <div>
      <Link href="/attendance" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> กลับ
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <CalendarDays size={20} className="text-secondary" />
        <h1 className="text-2xl font-black text-primary tracking-tight">ประวัติลงเวลา</h1>
      </div>

      {/* Month Filter */}
      <form method="GET" className="flex gap-3 mb-5">
        <select name="month" defaultValue={month} className="input-select">
          {MONTHS.map((m, i) => (
            <option key={i} value={String(i + 1)}>{m}</option>
          ))}
        </select>
        <input type="number" name="year" defaultValue={year} className="input-text w-24" />
        <button type="submit" className="btn-primary text-sm">ดู</button>
      </form>

      {/* Table */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-low border-b border-outline-variant/10">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันที่</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สถานะ</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">เข้า</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ออก</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">GPS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {records.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-on-surface-variant">ไม่มีข้อมูลเดือนนี้</td></tr>
            )}
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-surface-low transition-colors">
                <td className="px-4 py-3 text-xs whitespace-nowrap">
                  {new Date(r.date).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_COLOR[r.status] ?? "bg-surface-mid"}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-mono">{formatTime(r.checkInAt)}</td>
                <td className="px-4 py-3 text-xs font-mono">{formatTime(r.checkOutAt)}</td>
                <td className="px-4 py-3 text-xs">
                  {r.geofenceValid ? <span className="text-emerald-600">✓ ในเขต</span> : <span className="text-orange-600">⚠ นอกเขต</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
