"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, AlertTriangle, Clock, ChevronRight, CalendarClock, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { apiFetch, getAuthToken } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatThaiDateShort } from "@/lib/thai-date";

interface Task {
  assignmentId: number;
  caseId: number;
  title: string;
  registrationNo: string | null;
  urgencyLevel: string;
  dueDate: string | null;
  caseStatus: string;
  isOverdue: boolean;
  assignedAt: string;
}

interface MyTasksResponse {
  tasks: Task[];
  summary: { total: number; overdue: number; dueToday: number; dueSoon: number };
}

function subscribeToken(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
const hasTokenNow = () => (getAuthToken() ? "1" : "0");

/**
 * Notification bell + dropdown showing the top urgent/overdue tasks.
 * Falls back to empty state if the user has no tasks.
 */
export default function NotificationDropdown() {
  const tokenFlag = useSyncExternalStore(subscribeToken, hasTokenNow, () => "0");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MyTasksResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tokenFlag !== "1") return;
    // refresh tasks whenever the dropdown opens + on initial mount
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiFetch<MyTasksResponse>("/cases/my-tasks");
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setData({ tasks: [], summary: { total: 0, overdue: 0, dueToday: 0, dueSoon: 0 } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, tokenFlag]);

  const total = data?.summary.total ?? 0;
  const overdue = data?.summary.overdue ?? 0;
  const top = (data?.tasks ?? []).slice(0, 5);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          title="การแจ้งเตือน"
        >
          <Bell size={18} />
          {total > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5"
              style={{
                background: overdue > 0
                  ? "linear-gradient(135deg, #dc2626, #ef4444)"
                  : "linear-gradient(135deg, #6366f1, #7c3aed)",
                boxShadow: overdue > 0
                  ? "0 0 6px rgba(220,38,38,0.5)"
                  : "0 0 6px rgba(124,58,237,0.5)",
              }}
            >
              {total > 99 ? "99+" : total}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        {/* Header */}
        <div className="px-4 py-3 bg-primary/5 border-b border-outline-variant/40">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-on-surface">การแจ้งเตือน</span>
            {total > 0 && (
              <span className="text-xs text-on-surface-variant">
                {total} งาน{overdue > 0 && ` · เกินกำหนด ${overdue}`}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-xs text-on-surface-variant">กำลังโหลด…</div>
          ) : top.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 size={28} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-on-surface">ไม่มีงานค้าง</p>
              <p className="text-xs text-on-surface-variant mt-1">งานของคุณเคลียร์หมดแล้ว</p>
            </div>
          ) : (
            top.map((t) => (
              <Link
                key={t.assignmentId}
                href={`/inbox/${t.caseId}`}
                onClick={() => setOpen(false)}
                className={clsx(
                  "block px-4 py-3 hover:bg-primary/5 transition-colors border-b border-outline-variant/20 last:border-b-0",
                )}
              >
                <div className="flex items-start gap-2">
                  {t.isOverdue ? (
                    <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  ) : t.urgencyLevel !== "normal" ? (
                    <Clock size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <CalendarClock size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface line-clamp-2 leading-snug">
                      {t.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-on-surface-variant">
                      {t.registrationNo && <span className="font-mono font-semibold text-primary">{t.registrationNo}</span>}
                      {t.dueDate && (
                        <span className={clsx(t.isOverdue && "text-red-600 dark:text-red-400 font-semibold")}>
                          กำหนด {formatThaiDateShort(t.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Footer */}
        {top.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
            >
              <span>ดูทั้งหมด ({total})</span>
              <ChevronRight size={14} />
            </Link>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
