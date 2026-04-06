import { apiFetch } from "@/lib/api";
import Link from "next/link";
import {
  Radar,
  Newspaper,
  CalendarClock,
  TrendingUp,
  ArrowRight,
  Database,
  Globe,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface Agenda {
  id: number;
  agendaTitle: string;
  agendaType: string;
  currentStatus: string;
  priorityScore: number | null;
  momentumScore: number | null;
}

interface Signal {
  id: number;
  signalTitle: string;
  signalType: string;
  actionabilityLevel: string;
  detectedAt: string;
}

async function getAgendas(): Promise<Agenda[]> {
  try {
    return await apiFetch<Agenda[]>("/horizon/agendas");
  } catch {
    return [];
  }
}

async function getSignals(): Promise<Signal[]> {
  try {
    return await apiFetch<Signal[]>("/horizon/signals");
  } catch {
    return [];
  }
}

function PriorityBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-outline text-xs">--</span>;
  const color =
    score >= 80
      ? "bg-error-container text-on-error-container"
      : score >= 50
        ? "bg-amber-100 text-amber-700"
        : "bg-green-100 text-green-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}
    >
      {score}
    </span>
  );
}

function StatusBadgeSimple({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    emerging: "bg-amber-100 text-amber-700",
    monitoring: "bg-secondary-fixed text-secondary",
    archived: "bg-surface-high text-on-surface-variant",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${colorMap[status] ?? "bg-surface-high text-on-surface-variant"}`}
    >
      {status}
    </span>
  );
}

export default async function HorizonPage() {
  const [agendas, signals] = await Promise.all([getAgendas(), getSignals()]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
          Horizon Intelligence
        </h1>
        <p className="text-on-surface-variant mt-1">
          ติดตามวาระนโยบาย สัญญาณการเปลี่ยนแปลง และแหล่งข้อมูลภายนอก
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-primary-fixed rounded-2xl flex items-center justify-center">
            <CalendarClock size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-2xl font-black text-primary">{agendas.length}</p>
            <p className="text-xs text-on-surface-variant font-medium">วาระทั้งหมด</p>
          </div>
        </div>
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-secondary-fixed rounded-2xl flex items-center justify-center">
            <Radar size={20} className="text-secondary" />
          </div>
          <div>
            <p className="text-2xl font-black text-secondary">{signals.length}</p>
            <p className="text-xs text-on-surface-variant font-medium">สัญญาณ</p>
          </div>
        </div>
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-tertiary-fixed rounded-2xl flex items-center justify-center">
            <TrendingUp size={20} className="text-tertiary" />
          </div>
          <div>
            <p className="text-2xl font-black text-tertiary">
              {agendas.filter((a) => a.currentStatus === "active").length}
            </p>
            <p className="text-xs text-on-surface-variant font-medium">วาระที่กำลังดำเนินการ</p>
          </div>
        </div>
      </div>

      {/* Sub-page Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/horizon/sources"
          className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe size={18} className="text-primary" />
              <span className="font-bold text-on-surface">แหล่งข้อมูล</span>
            </div>
            <ArrowRight size={16} className="text-outline group-hover:text-primary transition-colors" />
          </div>
          <p className="text-xs text-on-surface-variant mt-2">จัดการแหล่งข้อมูลภายนอกสำหรับ Horizon Scanning</p>
        </Link>
        <Link
          href="/horizon/agendas"
          className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarClock size={18} className="text-secondary" />
              <span className="font-bold text-on-surface">วาระนโยบาย</span>
            </div>
            <ArrowRight size={16} className="text-outline group-hover:text-secondary transition-colors" />
          </div>
          <p className="text-xs text-on-surface-variant mt-2">เรียกดูและกรองวาระนโยบายทั้งหมด</p>
        </Link>
        <Link
          href="/horizon/signals"
          className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Newspaper size={18} className="text-tertiary" />
              <span className="font-bold text-on-surface">สัญญาณ</span>
            </div>
            <ArrowRight size={16} className="text-outline group-hover:text-tertiary transition-colors" />
          </div>
          <p className="text-xs text-on-surface-variant mt-2">รายการสัญญาณการเปลี่ยนแปลงที่ตรวจพบ</p>
        </Link>
      </div>

      {/* Top Agendas */}
      {agendas.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
              <CalendarClock size={14} />
              วาระนโยบายล่าสุด
            </h2>
            <Link href="/horizon/agendas" className="text-xs text-primary font-bold hover:underline">
              ดูทั้งหมด
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {agendas.slice(0, 4).map((agenda) => (
              <div
                key={agenda.id}
                className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-on-surface">{agenda.agendaTitle}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <StatusBadgeSimple status={agenda.currentStatus} />
                      <span className="text-[11px] text-outline">{agenda.agendaType}</span>
                    </div>
                  </div>
                  <PriorityBadge score={agenda.priorityScore} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Signals */}
      {signals.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-secondary uppercase tracking-wider flex items-center gap-2">
              <Radar size={14} />
              สัญญาณล่าสุด
            </h2>
            <Link href="/horizon/signals" className="text-xs text-secondary font-bold hover:underline">
              ดูทั้งหมด
            </Link>
          </div>
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-surface-low border-b border-outline-variant/10">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สัญญาณ</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ประเภท</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ระดับ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {signals.slice(0, 5).map((signal) => (
                  <tr key={signal.id} className="hover:bg-surface-low transition-colors">
                    <td className="px-4 py-3 font-medium text-on-surface">{signal.signalTitle}</td>
                    <td className="px-4 py-3 text-on-surface-variant text-xs">{signal.signalType}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-tertiary-fixed text-tertiary text-[10px] font-bold rounded-full uppercase">
                        {signal.actionabilityLevel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {agendas.length === 0 && signals.length === 0 && (
        <div className="text-center py-16">
          <Database size={48} className="text-outline/30 mx-auto mb-4" />
          <h3 className="font-bold text-on-surface-variant mb-2">ยังไม่มีข้อมูล Horizon</h3>
          <p className="text-sm text-outline mb-4">
            เริ่มต้นเพิ่มแหล่งข้อมูลเพื่อให้ระบบสแกนวาระนโยบายและสัญญาณการเปลี่ยนแปลง
          </p>
          <Link
            href="/horizon/sources"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-2xl font-bold text-sm"
          >
            <Globe size={16} />
            จัดการแหล่งข้อมูล
          </Link>
        </div>
      )}
    </div>
  );
}
