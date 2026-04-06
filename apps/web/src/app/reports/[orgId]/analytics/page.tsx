import { apiFetch } from "@/lib/api";
import Link from "next/link";
import {
  BarChart3,
  ArrowLeft,
  Clock,
  AlertTriangle,
  TrendingUp,
  CheckCircle,
  Timer,
  Database,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface ProcessingTime {
  stage: string;
  avgDays: number;
  caseCount: number;
}

interface Bottleneck {
  status: string;
  count: number;
  avgDaysInStatus: number;
  oldestCaseId: number | null;
  oldestCaseTitle: string | null;
}

interface KpiData {
  avgTimeToRegister: number;
  avgTimeToComplete: number;
  completionRate: number;
  overdueRate: number;
  casesByMonth: Array<{
    month: string;
    count: number;
  }>;
}

async function getProcessingTimes(orgId: string): Promise<ProcessingTime[]> {
  try {
    return await apiFetch<ProcessingTime[]>(`/reports/${orgId}/processing-times`);
  } catch {
    return [];
  }
}

async function getBottlenecks(orgId: string): Promise<Bottleneck[]> {
  try {
    return await apiFetch<Bottleneck[]>(`/reports/${orgId}/bottlenecks`);
  } catch {
    return [];
  }
}

async function getKpi(orgId: string): Promise<KpiData | null> {
  try {
    return await apiFetch<KpiData>(`/reports/${orgId}/kpi`);
  } catch {
    return null;
  }
}

const stageLabels: Record<string, string> = {
  new: "ใหม่",
  analyzing: "กำลังวิเคราะห์",
  proposed: "เสนอแนวทาง",
  registered: "ลงทะเบียนแล้ว",
  assigned: "มอบหมายแล้ว",
  in_progress: "กำลังดำเนินการ",
  completed: "เสร็จสิ้น",
  archived: "จัดเก็บ",
};

export default async function AnalyticsPage(props: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await props.params;

  const [processingTimes, bottlenecks, kpi] = await Promise.all([
    getProcessingTimes(orgId),
    getBottlenecks(orgId),
    getKpi(orgId),
  ]);

  const maxMonthCount = kpi?.casesByMonth
    ? Math.max(...kpi.casesByMonth.map((m) => m.count), 1)
    : 1;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/saraban/reports`}
        className="inline-flex items-center gap-1 text-sm text-primary font-bold hover:underline"
      >
        <ArrowLeft size={14} />
        รายงาน
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
          Analytics Dashboard
        </h1>
        <p className="text-on-surface-variant mt-1">
          วิเคราะห์ประสิทธิภาพการดำเนินงานเอกสาร
        </p>
      </div>

      {/* KPI Cards */}
      {kpi ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-primary-fixed rounded-xl flex items-center justify-center">
              <Timer size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-2xl font-black text-primary">{kpi.avgTimeToRegister.toFixed(1)}</p>
              <p className="text-[10px] text-outline uppercase tracking-wider font-bold">วันเฉลี่ย (ลงรับ)</p>
            </div>
          </div>
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-secondary-fixed rounded-xl flex items-center justify-center">
              <Clock size={18} className="text-secondary" />
            </div>
            <div>
              <p className="text-2xl font-black text-secondary">{kpi.avgTimeToComplete.toFixed(1)}</p>
              <p className="text-[10px] text-outline uppercase tracking-wider font-bold">วันเฉลี่ย (เสร็จสิ้น)</p>
            </div>
          </div>
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle size={18} className="text-green-700" />
            </div>
            <div>
              <p className="text-2xl font-black text-green-700">{kpi.completionRate.toFixed(1)}%</p>
              <p className="text-[10px] text-outline uppercase tracking-wider font-bold">อัตราเสร็จสิ้น</p>
            </div>
          </div>
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-error-container rounded-xl flex items-center justify-center">
              <AlertTriangle size={18} className="text-on-error-container" />
            </div>
            <div>
              <p className="text-2xl font-black text-on-error-container">{kpi.overdueRate.toFixed(1)}%</p>
              <p className="text-[10px] text-outline uppercase tracking-wider font-bold">อัตราเกินกำหนด</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <Database size={32} className="text-outline/30 mx-auto mb-2" />
          <p className="text-sm text-outline">ไม่สามารถโหลดข้อมูล KPI ได้</p>
        </div>
      )}

      {/* Processing Times */}
      <div>
        <h2 className="text-sm font-black text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
          <TrendingUp size={14} />
          ระยะเวลาแต่ละขั้นตอน
        </h2>
        {processingTimes.length > 0 ? (
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-surface-low border-b border-outline-variant/10">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ขั้นตอน</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-outline">วันเฉลี่ย</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-outline">จำนวนเคส</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {processingTimes.map((pt) => (
                  <tr key={pt.stage} className="hover:bg-surface-low transition-colors">
                    <td className="px-4 py-3 font-medium text-on-surface">
                      {stageLabels[pt.stage] ?? pt.stage}
                    </td>
                    <td className="px-4 py-3 text-right text-on-surface-variant font-mono text-xs">
                      {pt.avgDays.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right text-on-surface-variant font-mono text-xs">
                      {pt.caseCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-8 text-center text-outline shadow-sm">
            ยังไม่มีข้อมูลระยะเวลา
          </div>
        )}
      </div>

      {/* Bottlenecks */}
      <div>
        <h2 className="text-sm font-black text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
          <AlertTriangle size={14} />
          จุดคอขวด
        </h2>
        {bottlenecks.length > 0 ? (
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-surface-low border-b border-outline-variant/10">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สถานะ</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-outline">จำนวน</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-outline">วันเฉลี่ยในสถานะ</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">เคสเก่าที่สุด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {bottlenecks.map((bn) => (
                  <tr key={bn.status} className="hover:bg-surface-low transition-colors">
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full uppercase">
                        {stageLabels[bn.status] ?? bn.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-on-surface-variant font-mono text-xs font-bold">
                      {bn.count}
                    </td>
                    <td className="px-4 py-3 text-right text-on-surface-variant font-mono text-xs">
                      {bn.avgDaysInStatus.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant text-xs">
                      {bn.oldestCaseId ? (
                        <Link href={`/cases/${bn.oldestCaseId}`} className="text-primary hover:underline">
                          {bn.oldestCaseTitle ?? `#${bn.oldestCaseId}`}
                        </Link>
                      ) : (
                        <span className="text-outline">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-8 text-center text-outline shadow-sm">
            ไม่พบจุดคอขวด
          </div>
        )}
      </div>

      {/* Cases by Month */}
      {kpi?.casesByMonth && kpi.casesByMonth.length > 0 && (
        <div>
          <h2 className="text-sm font-black text-tertiary uppercase tracking-wider mb-3 flex items-center gap-2">
            <BarChart3 size={14} />
            เคสรายเดือน
          </h2>
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-6 shadow-sm">
            <div className="space-y-3">
              {kpi.casesByMonth.map((m) => (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-xs text-on-surface-variant w-20 shrink-0 font-medium">
                    {m.month}
                  </span>
                  <div className="flex-1 bg-surface-low rounded-full h-6 overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full flex items-center justify-end pr-2 transition-all"
                      style={{ width: `${Math.max((m.count / maxMonthCount) * 100, 5)}%` }}
                    >
                      <span className="text-[10px] font-bold text-on-primary">
                        {m.count}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
