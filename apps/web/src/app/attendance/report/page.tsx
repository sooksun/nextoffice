import { apiFetch } from "@/lib/api";
import { BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  checked_in: "เข้า", checked_out: "ออก", late: "สาย",
  absent: "ขาด", leave: "ลา", travel: "ราชการ",
};

interface ReportRecord {
  id: number;
  user: { id: number; fullName: string; roleCode: string };
  date: string; status: string;
  checkInAt: string | null; checkOutAt: string | null; geofenceValid: boolean;
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

async function getReport(dateFrom: string, dateTo: string): Promise<ReportRecord[]> {
  try {
    return await apiFetch<ReportRecord[]>(`/attendance/report?dateFrom=${dateFrom}&dateTo=${dateTo}`);
  } catch { return []; }
}

export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const dateFrom = sp.dateFrom || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const dateTo = sp.dateTo || now.toISOString().split("T")[0];
  const records = await getReport(dateFrom, dateTo);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 size={20} className="text-primary" />
        <h1 className="text-2xl font-black text-primary tracking-tight">รายงานลงเวลา</h1>
      </div>

      {/* Date Filter */}
      <form method="GET" className="flex gap-3 mb-5">
        <input type="date" name="dateFrom" defaultValue={dateFrom} className="input-text" />
        <span className="self-center text-on-surface-variant">ถึง</span>
        <input type="date" name="dateTo" defaultValue={dateTo} className="input-text" />
        <button type="submit" className="btn-primary text-sm">ดู</button>
      </form>

      {/* Report Table */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-low border-b border-outline-variant/10">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ชื่อ</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ตำแหน่ง</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันที่</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สถานะ</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">เข้า</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ออก</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">GPS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {records.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">ไม่มีข้อมูล</td></tr>
            )}
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-surface-low transition-colors">
                <td className="px-4 py-3 font-medium whitespace-nowrap">{r.user.fullName}</td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">{r.user.roleCode}</td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">
                  {new Date(r.date).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                </td>
                <td className="px-4 py-3 text-xs font-semibold">{STATUS_LABEL[r.status] ?? r.status}</td>
                <td className="px-4 py-3 text-xs font-mono">{formatTime(r.checkInAt)}</td>
                <td className="px-4 py-3 text-xs font-mono">{formatTime(r.checkOutAt)}</td>
                <td className="px-4 py-3 text-xs">
                  {r.geofenceValid ? "✓" : "⚠"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
