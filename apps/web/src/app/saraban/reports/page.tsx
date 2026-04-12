import { apiFetch } from "@/lib/api";
import { toThaiNumerals } from "@/lib/thai-date";
import { BarChart3, AlertTriangle, Users, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

interface Summary {
  inbound: { total: number; byStatus: Record<string, number>; byUrgency: Record<string, number>; overdue: number };
  outbound: { total: number; byStatus: Record<string, number> };
  registry: { inbound: number; outbound: number };
}
interface WorkloadItem { userId: number; fullName: string; roleCode: string; activeCases: number }
interface MonthItem { month: number; monthName: string; inbound: number; outbound: number; urgent: number }

async function getData(orgId: string) {
  const now = new Date();
  const buddhistYear = now.getFullYear() + 543;
  const [summary, workload, trend] = await Promise.allSettled([
    apiFetch<Summary>(`/reports/${orgId}/summary`),
    apiFetch<WorkloadItem[]>(`/reports/${orgId}/workload`),
    apiFetch<MonthItem[]>(`/reports/${orgId}/monthly-trend?year=${buddhistYear}`),
  ]);
  return {
    summary: summary.status === "fulfilled" ? summary.value : null,
    workload: workload.status === "fulfilled" ? workload.value : [],
    trend: trend.status === "fulfilled" ? trend.value : [],
  };
}

const URGENCY_TH: Record<string, string> = {
  normal: "ปกติ", urgent: "ด่วน", very_urgent: "ด่วนที่สุด", most_urgent: "ด่วนที่สุด",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const orgId = sp.organizationId ?? "1";
  const { summary, workload, trend } = await getData(orgId);

  const maxTrend = Math.max(...trend.map((t) => Math.max(t.inbound, t.outbound, 1)));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center">
          <BarChart3 size={20} className="text-tertiary" />
        </div>
        <h1 className="text-2xl font-black text-primary tracking-tight">รายงานสารบรรณ</h1>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="หนังสือรับทั้งหมด" value={toThaiNumerals(summary.inbound.total)} color="text-primary" />
          <StatCard label="หนังสือส่งทั้งหมด" value={toThaiNumerals(summary.outbound.total)} color="text-secondary" />
          <StatCard label="งานค้างเกิน deadline" value={toThaiNumerals(summary.inbound.overdue)} color="text-red-600" highlight={summary.inbound.overdue > 0} />
          <StatCard label="ทะเบียนรับ/ส่ง" value={`${toThaiNumerals(summary.registry.inbound)} / ${toThaiNumerals(summary.registry.outbound)}`} color="text-tertiary" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Urgency breakdown */}
        {summary && (
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
            <h2 className="font-bold text-sm text-on-surface mb-4 flex items-center gap-2">
              <AlertTriangle size={16} className="text-orange-500" />
              จำแนกตามชั้นความเร็ว
            </h2>
            <div className="space-y-2">
              {Object.entries(summary.inbound.byUrgency).map(([key, count]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs w-24 text-on-surface-variant">{URGENCY_TH[key] ?? key}</span>
                  <div className="flex-1 bg-surface-bright rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${key === "most_urgent" ? "bg-red-500" : key === "very_urgent" ? "bg-orange-400" : key === "urgent" ? "bg-yellow-400" : "bg-primary/40"}`}
                      style={{ width: `${summary.inbound.total ? (count / summary.inbound.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-on-surface w-8 text-right">{toThaiNumerals(count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status breakdown */}
        {summary && (
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
            <h2 className="font-bold text-sm text-on-surface mb-4">สถานะหนังสือรับ</h2>
            <div className="space-y-2">
              {Object.entries(summary.inbound.byStatus).map(([status, count]) => (
                <div key={status} className="flex justify-between items-center text-sm">
                  <span className="text-on-surface-variant text-xs capitalize">{status}</span>
                  <span className="font-bold text-on-surface">{toThaiNumerals(count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Monthly trend */}
      {trend.length > 0 && (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
          <h2 className="font-bold text-sm text-on-surface mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" />
            แนวโน้มรายเดือน (รับ/ส่ง/ด่วน)
          </h2>
          <div className="flex items-end gap-2 h-32">
            {trend.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex gap-0.5 items-end h-24">
                  <div
                    className="flex-1 bg-primary/60 rounded-t"
                    style={{ height: `${(m.inbound / maxTrend) * 100}%` }}
                    title={`รับ ${toThaiNumerals(m.inbound)}`}
                  />
                  <div
                    className="flex-1 bg-secondary/60 rounded-t"
                    style={{ height: `${(m.outbound / maxTrend) * 100}%` }}
                    title={`ส่ง ${toThaiNumerals(m.outbound)}`}
                  />
                  {m.urgent > 0 && (
                    <div
                      className="flex-1 bg-red-400/60 rounded-t"
                      style={{ height: `${(m.urgent / maxTrend) * 100}%` }}
                      title={`ด่วน ${toThaiNumerals(m.urgent)}`}
                    />
                  )}
                </div>
                <span className="text-[10px] text-on-surface-variant">{m.monthName}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary/60 inline-block" />รับ</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-secondary/60 inline-block" />ส่ง</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400/60 inline-block" />ด่วน</span>
          </div>
        </div>
      )}

      {/* Workload */}
      {workload.length > 0 && (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
          <h2 className="font-bold text-sm text-on-surface mb-4 flex items-center gap-2">
            <Users size={16} className="text-secondary" />
            ภาระงานรายบุคคล
          </h2>
          <div className="space-y-2">
            {workload.map((w) => (
              <div key={w.userId} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {w.fullName.charAt(0)}
                </div>
                <span className="flex-1 text-sm text-on-surface">{w.fullName}</span>
                <span className="text-xs text-on-surface-variant">{w.roleCode}</span>
                <span className={`text-sm font-bold ${w.activeCases > 5 ? "text-red-600" : "text-on-surface"}`}>
                  {toThaiNumerals(w.activeCases)} งาน
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, highlight }: {
  label: string;
  value: number | string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-surface-lowest rounded-2xl border p-5 shadow-sm ${highlight ? "border-red-300" : "border-outline-variant/10"}`}>
      <p className="text-xs text-on-surface-variant mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
