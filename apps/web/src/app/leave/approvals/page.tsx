import { apiFetch } from "@/lib/api";
import { CheckCircle, XCircle } from "lucide-react";
import { formatThaiDateShort } from "@/lib/thai-date";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  sick: "ลาป่วย", personal: "ลากิจ", vacation: "ลาพักผ่อน",
  maternity: "ลาคลอด", ordination: "ลาบวช", training: "ลาศึกษาต่อ",
};

interface PendingLeave {
  id: number; leaveType: string; startDate: string; endDate: string;
  totalDays: number; reason: string; submittedAt: string;
  user: { id: number; fullName: string; roleCode: string; positionTitle: string };
}

interface PendingTravel {
  id: number; travelDate: string; destination: string; purpose: string; submittedAt: string;
  user: { id: number; fullName: string; roleCode: string };
}

async function getPendingLeaves(): Promise<PendingLeave[]> {
  try { return await apiFetch<PendingLeave[]>("/attendance/leave/pending"); } catch { return []; }
}
async function getPendingTravels(): Promise<PendingTravel[]> {
  try { return await apiFetch<PendingTravel[]>("/attendance/leave/travel/pending"); } catch { return []; }
}

export default async function ApprovalsPage() {
  const [leaves, travels] = await Promise.all([getPendingLeaves(), getPendingTravels()]);

  return (
    <div>
      <h1 className="text-2xl font-black text-primary tracking-tight mb-6">รออนุมัติ</h1>

      {/* Pending Leave Requests */}
      <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">ใบลา ({leaves.length})</h2>
      {leaves.length === 0 ? (
        <p className="text-sm text-on-surface-variant mb-6">ไม่มีใบลารออนุมัติ</p>
      ) : (
        <div className="space-y-3 mb-6">
          {leaves.map((l) => (
            <div key={l.id} className="p-4 rounded-2xl border border-outline-variant/20 bg-surface-lowest">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-sm">{l.user.fullName} <span className="text-on-surface-variant font-normal">({l.user.positionTitle || l.user.roleCode})</span></p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {TYPE_LABEL[l.leaveType]} | {formatThaiDateShort(l.startDate)} - {formatThaiDateShort(l.endDate)} ({l.totalDays} วัน)
                  </p>
                  {l.reason && <p className="text-xs text-on-surface-variant mt-1">เหตุผล: {l.reason}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <form action={`/api/leave/${l.id}/approve`} method="POST">
                    <button className="p-2 rounded-xl bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 hover:bg-green-200 transition-colors">
                      <CheckCircle size={16} />
                    </button>
                  </form>
                  <form action={`/api/leave/${l.id}/reject`} method="POST">
                    <button className="p-2 rounded-xl bg-red-500/20 text-red-800 dark:text-red-300 hover:bg-red-200 transition-colors">
                      <XCircle size={16} />
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Travel Requests */}
      <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">ไปราชการ ({travels.length})</h2>
      {travels.length === 0 ? (
        <p className="text-sm text-on-surface-variant">ไม่มีคำขอไปราชการรออนุมัติ</p>
      ) : (
        <div className="space-y-3">
          {travels.map((t) => (
            <div key={t.id} className="p-4 rounded-2xl border border-outline-variant/20 bg-surface-lowest">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-sm">{t.user.fullName}</p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    วันที่: {formatThaiDateShort(t.travelDate)} | ปลายทาง: {t.destination}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">เรื่อง: {t.purpose}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="p-2 rounded-xl bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 hover:bg-green-200 transition-colors">
                    <CheckCircle size={16} />
                  </button>
                  <button className="p-2 rounded-xl bg-red-500/20 text-red-800 dark:text-red-300 hover:bg-red-200 transition-colors">
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
