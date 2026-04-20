import { apiFetch } from "@/lib/api";
import { BarChart3 } from "lucide-react";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  checked_in: "เข้า", checked_out: "ออก", late: "สาย",
  absent: "ขาด", leave: "ลา", travel: "ราชการ",
};

const STATUS_COLOR: Record<string, string> = {
  checked_in: "text-green-700 dark:text-green-400",
  checked_out: "text-blue-700 dark:text-blue-400",
  late: "text-amber-700 dark:text-amber-400",
  absent: "text-red-700 dark:text-red-400",
  leave: "text-purple-700 dark:text-purple-400",
  travel: "text-indigo-700 dark:text-indigo-400",
};

interface ReportRecord {
  id: number;
  user: { id: number; fullName: string; roleCode: string };
  date: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  geofenceValid: boolean;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    weekday: "short", day: "numeric", month: "short",
    timeZone: "Asia/Bangkok",
  });
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

  // Summary stats
  const summary = {
    total: records.length,
    checked_out: records.filter((r) => r.status === "checked_out").length,
    late: records.filter((r) => r.status === "late").length,
    absent: records.filter((r) => r.status === "absent").length,
    leave: records.filter((r) => r.status === "leave").length,
    geofenceWarn: records.filter((r) => !r.geofenceValid).length,
  };

  const fromLabel = new Date(dateFrom).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  const toLabel = new Date(dateTo).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 print:mb-4">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-primary print:hidden" />
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">รายงานลงเวลา</h1>
            <p className="text-xs text-on-surface-variant print:block hidden">
              ช่วงเวลา {fromLabel} — {toLabel}
            </p>
          </div>
        </div>
        <PrintButton />
      </div>

      {/* Date Filter (hidden on print) */}
      <form method="GET" className="flex gap-3 mb-5 print:hidden">
        <input type="date" name="dateFrom" defaultValue={dateFrom} className="input-text" />
        <span className="self-center text-on-surface-variant">ถึง</span>
        <input type="date" name="dateTo" defaultValue={dateTo} className="input-text" />
        <button type="submit" className="btn-primary text-sm">ดู</button>
      </form>

      {/* Summary Cards */}
      {records.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
          {[
            { label: "ทั้งหมด", value: summary.total, cls: "text-on-surface" },
            { label: "ออกแล้ว", value: summary.checked_out, cls: "text-blue-700 dark:text-blue-400" },
            { label: "สาย", value: summary.late, cls: "text-amber-700 dark:text-amber-400" },
            { label: "ขาด", value: summary.absent, cls: "text-red-700 dark:text-red-400" },
            { label: "ลา", value: summary.leave, cls: "text-purple-700 dark:text-purple-400" },
            { label: "GPS เตือน", value: summary.geofenceWarn, cls: "text-orange-700 dark:text-orange-400" },
          ].map((s) => (
            <div key={s.label} className="bg-surface-lowest rounded-xl border border-outline-variant/20 p-3 text-center">
              <div className={`text-2xl font-black ${s.cls}`}>{s.value}</div>
              <div className="text-[10px] text-on-surface-variant mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Print header (only visible when printing) */}
      <div className="hidden print:block mb-4 border-b pb-3">
        <div className="text-lg font-bold">รายงานลงเวลาปฏิบัติราชการ</div>
        <div className="text-sm text-gray-600">ช่วงเวลา {fromLabel} ถึง {toLabel}</div>
      </div>

      {/* Report Table */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm overflow-x-auto print:rounded-none print:border print:border-gray-300">
        <table className="w-full text-sm">
          <thead className="bg-surface-low border-b border-outline-variant/10 print:bg-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ชื่อ</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline print:hidden">ตำแหน่ง</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันที่</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สถานะ</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">เข้างาน</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ออกงาน</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">GPS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {records.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                  ไม่มีข้อมูลในช่วงเวลาที่เลือก
                </td>
              </tr>
            )}
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-surface-low transition-colors print:hover:bg-transparent">
                <td className="px-4 py-3 font-medium whitespace-nowrap">{r.user.fullName}</td>
                <td className="px-4 py-3 text-xs text-on-surface-variant print:hidden">{r.user.roleCode}</td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">{formatDate(r.date)}</td>
                <td className={`px-4 py-3 text-xs font-semibold ${STATUS_COLOR[r.status] ?? ""}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </td>
                <td className="px-4 py-3 text-xs font-mono">{formatTime(r.checkInAt)}</td>
                <td className="px-4 py-3 text-xs font-mono">{formatTime(r.checkOutAt)}</td>
                <td className="px-4 py-3 text-xs">
                  {r.geofenceValid
                    ? <span className="text-green-600">✓</span>
                    : <span className="text-amber-600" title="ตำแหน่งอยู่นอกเขต">⚠</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Print footer */}
      <div className="hidden print:block mt-6 pt-3 border-t text-xs text-gray-500">
        พิมพ์เมื่อ {new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}
        {" "}| รายงาน {records.length} รายการ
      </div>
    </div>
  );
}
