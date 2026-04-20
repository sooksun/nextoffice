import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import LeaveList, { type LeaveRequest } from "./LeaveList";

export const dynamic = "force-dynamic";

interface Balance {
  leaveType: string;
  label: string;
  totalAllowed: number;
  totalUsed: number;
  remaining: number;
}

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

      {/* Leave Requests Table (client component — handles edit/delete/print) */}
      <LeaveList initialRows={requests} />

      {/* Quick Links */}
      <div className="flex gap-3 mt-4">
        <Link href="/leave/approvals" className="btn-ghost text-xs">รออนุมัติ</Link>
        <Link href="/leave/travel" className="btn-ghost text-xs">ไปราชการ</Link>
      </div>
    </div>
  );
}
