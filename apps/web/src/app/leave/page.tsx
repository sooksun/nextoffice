import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { formatThaiDateShort } from "@/lib/thai-date";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  sick: "ลาป่วย", personal: "ลากิจ", vacation: "ลาพักผ่อน",
  maternity: "ลาคลอด", ordination: "ลาบวช", training: "ลาศึกษาต่อ",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", pending: "รออนุมัติ", approved: "อนุมัติ", rejected: "ไม่อนุมัติ", cancelled: "ยกเลิก",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-mid text-on-surface-variant", pending: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  approved: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300", rejected: "bg-red-500/20 text-red-800 dark:text-red-300",
  cancelled: "bg-surface-mid text-on-surface-variant",
};

interface LeaveRequest {
  id: number; leaveType: string; startDate: string; endDate: string;
  totalDays: number; status: string; reason: string; createdAt: string;
  approvedBy?: { fullName: string } | null;
}
interface Balance { leaveType: string; label: string; totalAllowed: number; totalUsed: number; remaining: number; }

async function getMyRequests(): Promise<LeaveRequest[]> {
  try { return await apiFetch<LeaveRequest[]>("/attendance/leave/my-requests"); } catch { return []; }
}
async function getBalance(): Promise<Balance[]> {
  try { return await apiFetch<Balance[]>("/attendance/leave/balance"); } catch { return []; }
}

export default async function LeavePage() {
  const [requests, balances] = await Promise.all([getMyRequests(), getBalance()]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center">
            <CalendarDays size={20} className="text-tertiary" />
          </div>
          <h1 className="text-2xl font-black text-primary tracking-tight">ระบบลาหยุด</h1>
        </div>
        <Link href="/leave/new" className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> ส่งใบลา
        </Link>
      </div>

      {/* Leave Balance */}
      {balances.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {balances.map((b) => (
            <div key={b.leaveType} className="p-4 rounded-2xl border border-outline-variant/20 bg-surface-lowest">
              <p className="text-xs text-on-surface-variant font-bold mb-1">{b.label}</p>
              <p className="text-2xl font-black text-primary">{b.remaining}</p>
              <p className="text-[10px] text-on-surface-variant">ใช้แล้ว {b.totalUsed} / {b.totalAllowed} วัน</p>
            </div>
          ))}
        </div>
      )}

      {/* Leave Requests Table */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-low border-b border-outline-variant/10">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ประเภท</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันที่</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">จำนวนวัน</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สถานะ</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">เหตุผล</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {requests.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-on-surface-variant">ยังไม่มีใบลา</td></tr>
            )}
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-surface-low transition-colors">
                <td className="px-4 py-3 font-medium">{TYPE_LABEL[r.leaveType] ?? r.leaveType}</td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">
                  {formatThaiDateShort(r.startDate)} - {formatThaiDateShort(r.endDate)}
                </td>
                <td className="px-4 py-3 text-xs">{r.totalDays} วัน</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_COLOR[r.status] ?? "bg-surface-mid"}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant max-w-xs truncate">{r.reason || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick Links */}
      <div className="flex gap-3 mt-4">
        <Link href="/leave/approvals" className="btn-ghost text-xs">รออนุมัติ</Link>
        <Link href="/leave/travel" className="btn-ghost text-xs">ไปราชการ</Link>
      </div>
    </div>
  );
}
