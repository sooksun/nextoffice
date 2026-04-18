import { cn } from "@/lib/utils";

/**
 * Centralised status / urgency pill components.
 * Dark-mode aware by convention — using color/opacity pairs that work in both
 * themes. Previously each list page defined its own STATUS_COLOR map with
 * light-only classes (e.g. `bg-blue-100 text-blue-800`) — unreadable in dark.
 */

const pillBase =
  "inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-lg text-xs font-semibold";

// ─── Urgency ────────────────────────────────────────────────────────────
export const URGENCY_LABEL: Record<string, string> = {
  normal: "ปกติ",
  urgent: "ด่วน",
  very_urgent: "ด่วนมาก",
  most_urgent: "ด่วนที่สุด",
};

const URGENCY_CLS: Record<string, string> = {
  normal: "bg-blue-500/15 text-blue-700 dark:bg-blue-500/25 dark:text-blue-200",
  urgent: "bg-amber-500/20 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200",
  very_urgent: "bg-orange-500/20 text-orange-800 dark:bg-orange-500/25 dark:text-orange-200",
  most_urgent: "bg-red-500/20 text-red-800 dark:bg-red-500/25 dark:text-red-200",
};

export function UrgencyBadge({ level, className }: { level: string; className?: string }) {
  return (
    <span className={cn(pillBase, URGENCY_CLS[level] ?? URGENCY_CLS.normal, className)}>
      {URGENCY_LABEL[level] ?? level}
    </span>
  );
}

// ─── Inbound case status ────────────────────────────────────────────────
export const CASE_STATUS_LABEL: Record<string, string> = {
  new: "ใหม่",
  analyzing: "วิเคราะห์",
  proposed: "เสนอ AI",
  registered: "ลงรับแล้ว",
  assigned: "มอบหมายแล้ว",
  in_progress: "ดำเนินการ",
  completed: "เสร็จสิ้น",
  archived: "เก็บถาวร",
};

const CASE_STATUS_CLS: Record<string, string> = {
  new: "bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  analyzing: "bg-purple-500/15 text-purple-700 dark:bg-purple-500/20 dark:text-purple-200",
  proposed: "bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200",
  registered: "bg-cyan-500/15 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-200",
  assigned: "bg-amber-500/20 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200",
  in_progress: "bg-orange-500/20 text-orange-800 dark:bg-orange-500/25 dark:text-orange-200",
  completed: "bg-emerald-500/20 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200",
  archived: "bg-slate-500/20 text-slate-700 dark:bg-slate-500/25 dark:text-slate-300",
};

export function CaseStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn(pillBase, CASE_STATUS_CLS[status] ?? CASE_STATUS_CLS.archived, className)}>
      {CASE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ─── Outbound document status ───────────────────────────────────────────
export const OUTBOUND_STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  sent: "ส่งแล้ว",
  rejected: "ไม่อนุมัติ",
};

const OUTBOUND_STATUS_CLS: Record<string, string> = {
  draft: "bg-surface-mid text-on-surface-variant border border-outline-variant/40",
  pending_approval: "bg-amber-500/20 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200",
  approved: "bg-blue-500/15 text-blue-700 dark:bg-blue-500/25 dark:text-blue-200",
  sent: "bg-emerald-500/20 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200",
  rejected: "bg-red-500/20 text-red-800 dark:bg-red-500/25 dark:text-red-200",
};

export function OutboundStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn(pillBase, OUTBOUND_STATUS_CLS[status] ?? OUTBOUND_STATUS_CLS.draft, className)}>
      {OUTBOUND_STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ─── Document "ราชการ/ทั่วไป" badge ────────────────────────────────────
export function OfficialBadge({ official }: { official: boolean | null }) {
  if (official === null) return <span className="text-on-surface-variant">—</span>;
  return official ? (
    <span className={cn(pillBase, "bg-primary/15 text-primary dark:bg-primary/20")}>ราชการ</span>
  ) : (
    <span className={cn(pillBase, "bg-surface-mid text-on-surface-variant")}>ทั่วไป</span>
  );
}
