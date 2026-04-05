"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getUser, type AuthUser } from "@/lib/auth";
import clsx from "clsx";
import {
  AlertTriangle,
  Clock,
  CalendarClock,
  RefreshCw,
  Building2,
  User,
  ChevronRight,
  BellRing,
  CheckCircle2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────

interface Task {
  assignmentId: number;
  caseId: number;
  title: string;
  registrationNo: string | null;
  urgencyLevel: string;
  dueDate: string | null;
  caseStatus: string;
  assignmentStatus: string;
  role: string;
  note: string | null;
  directorNote: string | null;
  isOverdue: boolean;
  assignedAt: string;
}

interface MyTasksResponse {
  tasks: Task[];
  summary: { total: number; overdue: number; dueToday: number; dueSoon: number };
}

interface SchoolCase {
  caseId: number;
  title: string;
  registrationNo: string | null;
  urgencyLevel: string;
  dueDate: string | null;
  status: string;
  isOverdue: boolean;
  assignedTo: { id: number; fullName: string } | null;
  pendingAssignmentCount: number;
}

interface SchoolResponse {
  cases: SchoolCase[];
  summary: {
    total: number;
    overdue: number;
    unregistered: number;
    registered: number;
    assigned: number;
    inProgress: number;
  };
}

// ─── Helpers ─────────────────────────────────────

const URGENCY_LABEL: Record<string, string> = {
  most_urgent: "เร่งด่วนที่สุด",
  very_urgent: "เร่งด่วนมาก",
  urgent: "เร่งด่วน",
  normal: "ปกติ",
};

const URGENCY_CLASSES: Record<string, string> = {
  most_urgent: "bg-error/15 text-error border-error/30",
  very_urgent: "bg-orange-100 text-orange-700 border-orange-200",
  urgent: "bg-yellow-100 text-yellow-700 border-yellow-200",
  normal: "bg-surface-high text-on-surface-variant border-outline-variant/20",
};

const URGENCY_DOT: Record<string, string> = {
  most_urgent: "bg-error",
  very_urgent: "bg-orange-500",
  urgent: "bg-yellow-500",
  normal: "bg-outline/40",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "รอดำเนินการ",
  accepted: "รับทราบแล้ว",
  in_progress: "กำลังดำเนินการ",
  completed: "เสร็จแล้ว",
};

const CASE_STATUS_LABEL: Record<string, string> = {
  new: "ใหม่",
  analyzing: "กำลังวิเคราะห์",
  proposed: "มีข้อเสนอแนะ",
  registered: "ลงรับแล้ว",
  assigned: "มอบหมายแล้ว",
  in_progress: "กำลังดำเนินการ",
  completed: "เสร็จแล้ว",
  archived: "เก็บถาวร",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dueDateLabel(dateStr: string | null, isOverdue: boolean) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (isOverdue) return { text: `เกินกำหนด ${Math.abs(diffDays)} วัน`, cls: "text-error" };
  if (diffDays === 0) return { text: "วันนี้!", cls: "text-error font-bold" };
  if (diffDays === 1) return { text: "พรุ่งนี้", cls: "text-orange-600 font-semibold" };
  if (diffDays <= 3) return { text: `อีก ${diffDays} วัน`, cls: "text-yellow-600" };
  return { text: formatDate(dateStr), cls: "text-outline" };
}

const ADMIN_ROLES = ["DIRECTOR", "VICE_DIRECTOR", "HEAD_TEACHER", "CLERK", "ADMIN"];

// ─── Sub-components ───────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border p-4 flex items-center gap-4",
        highlight && value > 0
          ? "bg-error/5 border-error/20"
          : "bg-surface-lowest border-outline-variant/10",
      )}
    >
      <div
        className={clsx(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          highlight && value > 0 ? "bg-error/10 text-error" : "bg-primary/10 text-primary",
        )}
      >
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-black text-on-surface leading-none">{value}</p>
        <p className="text-xs text-outline mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function UrgencyBadge({ level }: { level: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
        URGENCY_CLASSES[level] ?? URGENCY_CLASSES.normal,
      )}
    >
      <span className={clsx("w-1.5 h-1.5 rounded-full", URGENCY_DOT[level] ?? "bg-outline/40")} />
      {URGENCY_LABEL[level] ?? level}
    </span>
  );
}

function TaskCard({ task }: { task: Task }) {
  const due = dueDateLabel(task.dueDate, task.isOverdue);
  return (
    <Link
      href={`/cases/${task.caseId}`}
      className={clsx(
        "block rounded-2xl border p-4 transition-all hover:shadow-sm hover:border-primary/30",
        task.isOverdue
          ? "bg-error/5 border-error/20"
          : "bg-surface-lowest border-outline-variant/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <UrgencyBadge level={task.urgencyLevel} />
            {task.registrationNo && (
              <span className="text-[11px] font-mono text-outline bg-surface-low px-2 py-0.5 rounded-full border border-outline-variant/20">
                {task.registrationNo}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-on-surface leading-snug line-clamp-2">
            {task.title}
          </p>
          {task.directorNote && (
            <p className="text-xs text-outline mt-1 line-clamp-1">
              คำสั่ง: {task.directorNote}
            </p>
          )}
        </div>
        <ChevronRight size={16} className="text-outline shrink-0 mt-1" />
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs flex-wrap">
        {due && (
          <span className={clsx("flex items-center gap-1", due.cls)}>
            <Clock size={12} />
            {due.text}
          </span>
        )}
        <span className="flex items-center gap-1 text-outline">
          <User size={12} />
          {STATUS_LABEL[task.assignmentStatus] ?? task.assignmentStatus}
        </span>
        {task.role === "responsible" && (
          <span className="text-primary/70">ผู้รับผิดชอบ</span>
        )}
      </div>
    </Link>
  );
}

function SchoolCaseCard({ c }: { c: SchoolCase }) {
  const due = dueDateLabel(c.dueDate, c.isOverdue);
  return (
    <Link
      href={`/cases/${c.caseId}`}
      className={clsx(
        "block rounded-2xl border p-4 transition-all hover:shadow-sm hover:border-primary/30",
        c.isOverdue
          ? "bg-error/5 border-error/20"
          : "bg-surface-lowest border-outline-variant/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <UrgencyBadge level={c.urgencyLevel} />
            <span
              className={clsx(
                "text-[11px] px-2 py-0.5 rounded-full border",
                c.status === "registered"
                  ? "bg-blue-50 text-blue-600 border-blue-200"
                  : c.status === "assigned" || c.status === "in_progress"
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-surface-high text-on-surface-variant border-outline-variant/20",
              )}
            >
              {CASE_STATUS_LABEL[c.status] ?? c.status}
            </span>
            {c.registrationNo && (
              <span className="text-[11px] font-mono text-outline bg-surface-low px-2 py-0.5 rounded-full border border-outline-variant/20">
                {c.registrationNo}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-on-surface leading-snug line-clamp-2">
            {c.title}
          </p>
        </div>
        <ChevronRight size={16} className="text-outline shrink-0 mt-1" />
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs flex-wrap">
        {due && (
          <span className={clsx("flex items-center gap-1", due.cls)}>
            <Clock size={12} />
            {due.text}
          </span>
        )}
        {c.assignedTo ? (
          <span className="flex items-center gap-1 text-outline">
            <User size={12} />
            {c.assignedTo.fullName}
          </span>
        ) : (
          <span className="text-outline italic">ยังไม่มอบหมาย</span>
        )}
        {c.pendingAssignmentCount > 0 && (
          <span className="text-outline">{c.pendingAssignmentCount} งานค้าง</span>
        )}
      </div>
    </Link>
  );
}

// ─── Filter tabs ──────────────────────────────────

const URGENCY_FILTERS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "most_urgent", label: "เร่งด่วนที่สุด" },
  { value: "very_urgent", label: "เร่งด่วนมาก" },
  { value: "urgent", label: "เร่งด่วน" },
  { value: "normal", label: "ปกติ" },
];

// ─── Main Page ────────────────────────────────────

export default function NotificationsPage() {
  const user = getUser() as AuthUser | null;
  const isAdmin = user ? ADMIN_ROLES.includes(user.roleCode) : false;

  const [tab, setTab] = useState<"personal" | "school">("personal");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [myTasks, setMyTasks] = useState<MyTasksResponse | null>(null);
  const [schoolData, setSchoolData] = useState<SchoolResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadMyTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<MyTasksResponse>("/cases/my-tasks");
      setMyTasks(data);
      setLastUpdated(new Date());
    } catch {
      setMyTasks({ tasks: [], summary: { total: 0, overdue: 0, dueToday: 0, dueSoon: 0 } });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSchoolData = useCallback(async () => {
    if (!isAdmin) return;
    setSchoolLoading(true);
    try {
      const data = await apiFetch<SchoolResponse>("/cases/school-pending");
      setSchoolData(data);
    } catch {
      setSchoolData({ cases: [], summary: { total: 0, overdue: 0, unregistered: 0, registered: 0, assigned: 0, inProgress: 0 } });
    } finally {
      setSchoolLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadMyTasks();
  }, [loadMyTasks]);

  useEffect(() => {
    if (tab === "school" && !schoolData) {
      void loadSchoolData();
    }
  }, [tab, schoolData, loadSchoolData]);

  function handleRefresh() {
    void loadMyTasks();
    if (tab === "school") void loadSchoolData();
  }

  const filteredMyTasks =
    urgencyFilter === "all"
      ? (myTasks?.tasks ?? [])
      : (myTasks?.tasks ?? []).filter((t) => t.urgencyLevel === urgencyFilter);

  const filteredSchoolCases =
    urgencyFilter === "all"
      ? (schoolData?.cases ?? [])
      : (schoolData?.cases ?? []).filter((c) => c.urgencyLevel === urgencyFilter);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BellRing size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">
              การแจ้งเตือนงาน
            </h1>
            {lastUpdated && (
              <p className="text-[11px] text-outline mt-0.5">
                อัปเดตล่าสุด {lastUpdated.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="p-2 text-outline hover:text-primary hover:bg-primary/5 rounded-xl transition-colors"
          title="รีเฟรช"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* View tabs (admin only) */}
      {isAdmin && (
        <div className="flex gap-1 bg-surface-low rounded-2xl p-1 mb-5 border border-outline-variant/10">
          <button
            onClick={() => setTab("personal")}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
              tab === "personal"
                ? "bg-surface-lowest shadow-sm text-primary"
                : "text-on-surface-variant hover:text-primary",
            )}
          >
            <User size={15} />
            งานของฉัน
            {myTasks && myTasks.summary.total > 0 && (
              <span className={clsx("text-[11px] px-1.5 py-0.5 rounded-full font-bold",
                myTasks.summary.overdue > 0 ? "bg-error/15 text-error" : "bg-primary/10 text-primary"
              )}>
                {myTasks.summary.total}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("school")}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
              tab === "school"
                ? "bg-surface-lowest shadow-sm text-primary"
                : "text-on-surface-variant hover:text-primary",
            )}
          >
            <Building2 size={15} />
            ภาพรวมโรงเรียน
            {schoolData && schoolData.summary.total > 0 && (
              <span className={clsx("text-[11px] px-1.5 py-0.5 rounded-full font-bold",
                schoolData.summary.overdue > 0 ? "bg-error/15 text-error" : "bg-primary/10 text-primary"
              )}>
                {schoolData.summary.total}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── PERSONAL TASKS ── */}
      {tab === "personal" && (
        <>
          {/* Summary cards */}
          {myTasks && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <SummaryCard icon={BellRing} label="งานทั้งหมด" value={myTasks.summary.total} />
              <SummaryCard icon={AlertTriangle} label="เกินกำหนด" value={myTasks.summary.overdue} highlight />
              <SummaryCard icon={CalendarClock} label="วันนี้" value={myTasks.summary.dueToday} highlight={myTasks.summary.dueToday > 0} />
              <SummaryCard icon={Clock} label="ภายใน 3 วัน" value={myTasks.summary.dueSoon} />
            </div>
          )}

          {/* Urgency filter */}
          <div className="flex gap-1.5 flex-wrap mb-4">
            {URGENCY_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setUrgencyFilter(f.value)}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  urgencyFilter === f.value
                    ? "bg-primary text-on-primary border-primary"
                    : "bg-surface-low text-on-surface-variant border-outline-variant/20 hover:border-primary/30 hover:text-primary",
                )}
              >
                {f.label}
                {f.value !== "all" && myTasks && (
                  <span className="ml-1 opacity-60">
                    {myTasks.tasks.filter((t) => t.urgencyLevel === f.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Task list */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-2xl bg-surface-low animate-pulse" />
              ))}
            </div>
          ) : filteredMyTasks.length === 0 ? (
            <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center">
              <CheckCircle2 size={40} className="text-primary/30 mx-auto mb-3" />
              <p className="text-on-surface-variant font-semibold">ไม่มีงานค้าง</p>
              <p className="text-outline text-sm mt-1">ทุกงานเสร็จสมบูรณ์แล้ว</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredMyTasks.map((task) => (
                <TaskCard key={task.assignmentId} task={task} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── SCHOOL OVERVIEW ── */}
      {tab === "school" && isAdmin && (
        <>
          {/* Summary cards */}
          {schoolData && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              <SummaryCard icon={BellRing} label="งานทั้งหมด" value={schoolData.summary.total} />
              <SummaryCard icon={AlertTriangle} label="เกินกำหนด" value={schoolData.summary.overdue} highlight />
              <SummaryCard icon={Clock} label="รอลงรับ" value={schoolData.summary.unregistered} />
              <SummaryCard icon={CalendarClock} label="ลงรับแล้ว" value={schoolData.summary.registered} />
              <SummaryCard icon={User} label="มอบหมายแล้ว" value={schoolData.summary.assigned} />
              <SummaryCard icon={CheckCircle2} label="กำลังดำเนินการ" value={schoolData.summary.inProgress} />
            </div>
          )}

          {/* Urgency filter */}
          <div className="flex gap-1.5 flex-wrap mb-4">
            {URGENCY_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setUrgencyFilter(f.value)}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  urgencyFilter === f.value
                    ? "bg-primary text-on-primary border-primary"
                    : "bg-surface-low text-on-surface-variant border-outline-variant/20 hover:border-primary/30 hover:text-primary",
                )}
              >
                {f.label}
                {f.value !== "all" && schoolData && (
                  <span className="ml-1 opacity-60">
                    {schoolData.cases.filter((c) => c.urgencyLevel === f.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Case list */}
          {schoolLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-2xl bg-surface-low animate-pulse" />
              ))}
            </div>
          ) : filteredSchoolCases.length === 0 ? (
            <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center">
              <CheckCircle2 size={40} className="text-primary/30 mx-auto mb-3" />
              <p className="text-on-surface-variant font-semibold">ไม่มีงานค้าง</p>
              <p className="text-outline text-sm mt-1">ทุกงานเสร็จสมบูรณ์แล้ว</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredSchoolCases.map((c) => (
                <SchoolCaseCard key={c.caseId} c={c} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
