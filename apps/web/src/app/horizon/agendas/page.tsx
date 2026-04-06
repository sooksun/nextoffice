"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CalendarClock, Loader2, Filter } from "lucide-react";

interface Agenda {
  id: number;
  agendaTitle: string;
  agendaType: string;
  currentStatus: string;
  priorityScore: number | null;
  momentumScore: number | null;
  summary: string | null;
}

const STATUS_OPTIONS = ["all", "active", "emerging", "monitoring", "archived"] as const;
const STATUS_LABELS: Record<string, string> = {
  all: "ทั้งหมด",
  active: "กำลังดำเนินการ",
  emerging: "กำลังเกิดขึ้น",
  monitoring: "ติดตาม",
  archived: "เก็บถาวร",
};

function PriorityBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-outline text-xs">--</span>;
  const color =
    score >= 80
      ? "bg-error-container text-on-error-container"
      : score >= 50
        ? "bg-amber-100 text-amber-700"
        : "bg-green-100 text-green-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>
      {score}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
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

export default function HorizonAgendasPage() {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    loadAgendas();
  }, []);

  async function loadAgendas() {
    setLoading(true);
    try {
      const data = await apiFetch<Agenda[]>("/horizon/agendas");
      setAgendas(data);
    } catch {
      setAgendas([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = filter === "all" ? agendas : agendas.filter((a) => a.currentStatus === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
          วาระนโยบาย
        </h1>
        <p className="text-on-surface-variant mt-1">
          เรียกดูวาระนโยบายและแนวโน้มจาก Horizon Scanning
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-outline" />
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                filter === s
                  ? "bg-primary text-on-primary"
                  : "bg-surface-low text-on-surface-variant hover:bg-surface-high"
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center text-outline shadow-sm">
          <CalendarClock size={48} className="text-outline/30 mx-auto mb-4" />
          <h3 className="font-bold text-on-surface-variant mb-2">
            {filter === "all" ? "ยังไม่มีวาระนโยบาย" : `ไม่พบวาระในสถานะ "${STATUS_LABELS[filter]}"`}
          </h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((agenda) => (
            <div
              key={agenda.id}
              className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-on-surface">{agenda.agendaTitle}</h3>
                  {agenda.summary && (
                    <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">
                      {agenda.summary}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <StatusBadge status={agenda.currentStatus} />
                    <span className="text-[11px] text-outline">{agenda.agendaType}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <PriorityBadge score={agenda.priorityScore} />
                  {agenda.momentumScore != null && (
                    <span className="text-[10px] text-outline">
                      momentum: {agenda.momentumScore}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
