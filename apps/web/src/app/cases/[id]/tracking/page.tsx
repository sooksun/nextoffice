"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toThaiNumerals } from "@/lib/thai-date";
import clsx from "clsx";
import {
  ArrowLeft,
  Users,
  CheckCircle2,
  Clock,
  Loader2,
  CircleCheck,
  CircleDot,
  CirclePause,
  RefreshCw,
} from "lucide-react";

// ─── Types ───────────────────────────────────────

interface AssigneeInfo {
  id: number;
  fullName: string;
  roleCode: string;
  department: string | null;
}

interface Assignment {
  id: number;
  role: string;
  status: string;
  dueDate: string | null;
  note: string | null;
  completedAt: string | null;
  createdAt: string;
  assignedTo: AssigneeInfo;
  assignedBy: { id: number; fullName: string; roleCode: string };
}

interface TrackingResponse {
  case: {
    id: number;
    title: string;
    registrationNo: string | null;
    status: string;
    urgencyLevel: string;
    directorNote: string | null;
    directorStampStatus: string;
    directorStampedAt: string | null;
    dueDate: string | null;
    directorStampedBy: { id: number; fullName: string } | null;
  };
  assignments: Assignment[];
  summary: {
    total: number;
    acknowledged: number;
    inProgress: number;
    completed: number;
    acknowledgmentPercent: number;
    completionPercent: number;
  };
}

// ─── Helpers ─────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending: "รอรับทราบ",
  accepted: "รับทราบแล้ว",
  in_progress: "กำลังดำเนินการ",
  completed: "เสร็จแล้ว",
};

const STATUS_ICON: Record<string, typeof Clock> = {
  pending: CirclePause,
  accepted: CircleCheck,
  in_progress: CircleDot,
  completed: CheckCircle2,
};

const STATUS_CLASS: Record<string, string> = {
  pending: "text-amber-600 bg-amber-50",
  accepted: "text-blue-600 bg-blue-50",
  in_progress: "text-primary bg-primary/10",
  completed: "text-green-600 bg-green-50",
};

const ROLE_LABEL: Record<string, string> = {
  responsible: "ผู้รับผิดชอบ",
  informed: "รับทราบ",
  cc: "สำเนา",
};

const ROLE_CLASS: Record<string, string> = {
  responsible: "bg-primary/10 text-primary",
  informed: "bg-outline/10 text-outline",
  cc: "bg-surface-high text-on-surface-variant",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dueDateLabel(dateStr: string | null): { text: string; isOverdue: boolean } {
  if (!dateStr) return { text: "ไม่กำหนด", isOverdue: false };
  const due = new Date(dateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return { text: `เกินกำหนด ${Math.abs(diff)} วัน`, isOverdue: true };
  if (diff === 0) return { text: "ครบกำหนดวันนี้", isOverdue: false };
  return { text: `อีก ${diff} วัน`, isOverdue: false };
}

// ─── Page ────────────────────────────────────────

export default function TrackingPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TrackingResponse>(`/cases/${id}/tracking`)
      .then(setData)
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <Link href={`/cases/${id}`} className="text-primary hover:text-secondary text-sm font-bold">
          <ArrowLeft className="w-4 h-4 inline mr-1" />กลับ
        </Link>
        <p className="mt-4 text-on-surface-variant">{error || "ไม่พบข้อมูล"}</p>
      </div>
    );
  }

  const { case: c, assignments, summary } = data;
  const due = dueDateLabel(c.dueDate);

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Back link */}
      <Link href={`/cases/${id}`} className="text-primary hover:text-secondary text-sm font-bold">
        <ArrowLeft className="w-4 h-4 inline mr-1" />กลับ
      </Link>

      {/* Case header */}
      <div className="mt-4 mb-6">
        <h1 className="text-xl font-black text-primary tracking-tight">{c.title}</h1>
        <div className="flex items-center gap-3 mt-2 text-xs text-outline flex-wrap">
          {c.registrationNo && (
            <span className="font-mono bg-surface-low px-2 py-0.5 rounded-full border border-outline-variant/20">
              เลขรับ {toThaiNumerals(c.registrationNo)}
            </span>
          )}
          {c.dueDate && (
            <span className={clsx(due.isOverdue && "text-error font-bold")}>
              กำหนด {formatDate(c.dueDate)} ({due.text})
            </span>
          )}
        </div>
        {c.directorNote && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
            <span className="font-bold">คำสั่ง ผอ.:</span> {c.directorNote}
            {c.directorStampedBy && (
              <span className="text-xs text-green-600 ml-2">
                — {c.directorStampedBy.fullName}, {formatDate(c.directorStampedAt)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryCard icon={Users} label="มอบหมาย" value={summary.total} />
        <SummaryCard icon={CheckCircle2} label="รับทราบ" value={summary.acknowledged} highlight={summary.acknowledged < summary.total ? "warn" : undefined} />
        <SummaryCard icon={RefreshCw} label="ดำเนินการ" value={summary.inProgress} />
        <SummaryCard icon={CircleCheck} label="เสร็จแล้ว" value={summary.completed} highlight={summary.completed === summary.total && summary.total > 0 ? "success" : undefined} />
      </div>

      {/* Progress bar */}
      {summary.total > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-outline mb-1">
            <span>ความคืบหน้า</span>
            <span>{summary.completionPercent}% เสร็จ | {summary.acknowledgmentPercent}% รับทราบ</span>
          </div>
          <div className="w-full h-2.5 bg-surface-high rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${summary.completionPercent}%` }}
            />
          </div>
          <div className="w-full h-1.5 bg-surface-high rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-blue-400 rounded-full transition-all"
              style={{ width: `${summary.acknowledgmentPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Assignments list */}
      <section className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-surface-bright border-b border-outline-variant/10">
          <h2 className="text-sm font-bold text-on-surface">รายชื่อผู้รับมอบหมาย</h2>
        </div>

        {assignments.length === 0 ? (
          <p className="p-5 text-sm text-on-surface-variant">ยังไม่มีผู้รับมอบหมาย</p>
        ) : (
          <div className="divide-y divide-outline-variant/10">
            {assignments.map((a) => {
              const Icon = STATUS_ICON[a.status] || Clock;
              return (
                <div key={a.id} className="p-4 hover:bg-surface-bright/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: name + role */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-on-surface">{a.assignedTo.fullName}</span>
                        <span className={clsx("text-[10px] px-1.5 py-0.5 rounded-full font-medium", ROLE_CLASS[a.role])}>
                          {ROLE_LABEL[a.role] || a.role}
                        </span>
                      </div>
                      {a.assignedTo.department && (
                        <p className="text-xs text-outline mt-0.5">{a.assignedTo.department}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-outline flex-wrap">
                        <span>มอบหมายเมื่อ {formatDateTime(a.createdAt)}</span>
                        {a.dueDate && (
                          <span className={clsx(dueDateLabel(a.dueDate).isOverdue && "text-error font-bold")}>
                            กำหนด {formatDate(a.dueDate)}
                          </span>
                        )}
                        {a.completedAt && <span>เสร็จเมื่อ {formatDateTime(a.completedAt)}</span>}
                      </div>
                      {a.note && <p className="text-xs text-on-surface-variant mt-1">{a.note}</p>}
                    </div>

                    {/* Right: status badge */}
                    <span className={clsx("inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap", STATUS_CLASS[a.status])}>
                      <Icon className="w-3.5 h-3.5" />
                      {STATUS_LABEL[a.status] || a.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Summary Card ────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  highlight?: "warn" | "success";
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border p-3 text-center",
        highlight === "warn" && "bg-amber-50 border-amber-200",
        highlight === "success" && "bg-green-50 border-green-200",
        !highlight && "bg-surface-lowest border-outline-variant/10",
      )}
    >
      <Icon
        className={clsx(
          "w-5 h-5 mx-auto mb-1",
          highlight === "warn" && "text-amber-500",
          highlight === "success" && "text-green-500",
          !highlight && "text-outline",
        )}
      />
      <div className="text-2xl font-black text-on-surface">{toThaiNumerals(String(value))}</div>
      <div className="text-[11px] text-outline">{label}</div>
    </div>
  );
}
