"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import {
  Inbox, SendHorizontal, CheckCircle, AlertTriangle,
  CalendarDays, ClipboardList, ChevronRight, Clock, PenLine,
} from "lucide-react";
import { formatThaiDateTime } from "@/lib/thai-date";
import clsx from "clsx";
import { Card, CardContent } from "@/components/ui/card";
import { UrgencyBadge } from "@/components/status-badges";

interface SummaryStats {
  inboundTotal: number;
  inboundToday: number;
  inboundPending: number;
  outboundDraft: number;
  outboundPendingApproval: number;
  outboundSentToday: number;
  leavePending: number;
  overdueCases: number;
}

interface RecentCase {
  id: number;
  title: string;
  registrationNo: string | null;
  urgencyLevel: string;
  status: string;
  receivedAt: string;
  organization: { name: string } | null;
}

interface PendingOutbound {
  id: number;
  subject: string;
  recipientOrg: string | null;
  urgencyLevel: string;
  createdAt: string;
  createdBy: { fullName: string } | null;
}

interface StoredUser {
  id: number;
  fullName: string;
  organizationId: number;
  roleCode: string;
}

function subscribeStorage(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function getStoredUser(): StoredUser | null {
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

type DashboardData = {
  stats: SummaryStats;
  recent: RecentCase[];
  pendingOutbound: PendingOutbound[];
  pendingSigningCount: number;
};

export default function DirectorDashboard() {
  const user = useSyncExternalStore<StoredUser | null>(subscribeStorage, getStoredUser, () => null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!user?.organizationId) return;
    const orgId = user.organizationId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    startTransition(() => {
      Promise.allSettled([
        apiFetch<{ total: number; data: RecentCase[] }>(`/cases?take=5`),
        apiFetch<{ total: number; data: RecentCase[] }>(`/cases?take=200`),
        apiFetch<{ total: number; data: RecentCase[] }>(`/cases?status=new&take=200`).catch(() => ({ total: 0, data: [] })),
        apiFetch<PendingOutbound[]>(`/outbound/${orgId}/documents?status=pending_approval`).catch(() => []),
        apiFetch<PendingOutbound[]>(`/outbound/${orgId}/documents?status=draft`).catch(() => []),
        apiFetch<{ total: number; data: RecentCase[] }>(`/cases?dateFrom=${todayStr}&take=50`).catch(() => ({ total: 0, data: [] })),
        apiFetch<unknown[]>(`/cases/pending-director-signing`).catch(() => []),
      ]).then(([recentRes, allRes, pendingRes, pendingOutRes, draftOutRes, todayRes, pendingSignRes]) => {
        const recent = recentRes.status === "fulfilled" ? recentRes.value.data ?? [] : [];
        const allTotal = allRes.status === "fulfilled" ? allRes.value.total ?? 0 : 0;
        const pendingTotal = pendingRes.status === "fulfilled" ? pendingRes.value.total ?? 0 : 0;
        const pendingOut = pendingOutRes.status === "fulfilled" ? pendingOutRes.value : [];
        const draftOut = draftOutRes.status === "fulfilled" ? draftOutRes.value : [];
        const todayTotal = todayRes.status === "fulfilled" ? todayRes.value.total ?? 0 : 0;
        const pendingSign = pendingSignRes.status === "fulfilled" ? pendingSignRes.value : [];

        setData({
          recent,
          pendingOutbound: Array.isArray(pendingOut) ? pendingOut : [],
          pendingSigningCount: Array.isArray(pendingSign) ? pendingSign.length : 0,
          stats: {
            inboundTotal: allTotal,
            inboundToday: todayTotal,
            inboundPending: pendingTotal,
            outboundDraft: Array.isArray(draftOut) ? draftOut.length : 0,
            outboundPendingApproval: Array.isArray(pendingOut) ? pendingOut.length : 0,
            outboundSentToday: 0,
            leavePending: 0,
            overdueCases: 0,
          },
        });
      });
    });
  }, [user?.organizationId]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-on-surface-variant text-sm animate-pulse">กำลังโหลดข้อมูล...</div>
      </div>
    );
  }

  const { stats, recent, pendingOutbound, pendingSigningCount } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-primary tracking-tight">
          สวัสดี, {user?.fullName?.split(" ")[0] ?? "ผู้อำนวยการ"}
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          แดชบอร์ดผู้อำนวยการ — ภาพรวมงานสารบรรณ
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="หนังสือเข้าทั้งหมด"
          value={stats.inboundTotal}
          sub={`วันนี้ ${stats.inboundToday} ฉบับ`}
          icon={Inbox}
          accent="text-primary bg-primary/10"
          href="/inbox"
        />
        <StatCard
          label="รอดำเนินการ"
          value={stats.inboundPending}
          sub="หนังสือเข้าใหม่"
          icon={AlertTriangle}
          accent="text-orange-600 dark:text-orange-300 bg-orange-500/15"
          href="/inbox"
        />
        <StatCard
          label="รออนุมัติส่ง"
          value={stats.outboundPendingApproval}
          sub={`ร่าง ${stats.outboundDraft} ฉบับ`}
          icon={CheckCircle}
          accent="text-secondary bg-secondary/10"
          href="/outbound?status=pending_approval"
        />
        <StatCard
          label="รอลงนาม ผอ."
          value={pendingSigningCount}
          sub="หนังสือรอเกษียณ"
          icon={PenLine}
          accent="text-violet-600 dark:text-violet-300 bg-violet-500/15"
          href="/director/signing"
        />
        <StatCard
          label="ใบลารออนุมัติ"
          value={stats.leavePending}
          sub="รอการพิจารณา"
          icon={CalendarDays}
          accent="text-tertiary bg-tertiary/10"
          href="/leave/approvals"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <QuickAction href="/inbox" icon={Inbox} label="ดูหนังสือเข้า" color="bg-primary/10 text-primary" />
        <QuickAction href="/outbound/new" icon={SendHorizontal} label="สร้างหนังสือออก" color="bg-secondary/10 text-secondary" />
        <QuickAction href="/director/signing" icon={PenLine} label="ลงนามเกษียณ" color="bg-violet-500/15 text-violet-600 dark:text-violet-300" />
        <QuickAction href="/outbound" icon={CheckCircle} label="อนุมัติหนังสือ" color="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" />
        <QuickAction href="/leave/approvals" icon={CalendarDays} label="อนุมัติใบลา" color="bg-tertiary/10 text-tertiary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Inbound */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/40">
            <div className="flex items-center gap-2">
              <Inbox size={17} className="text-primary" />
              <h2 className="font-bold text-on-surface text-sm">หนังสือเข้าล่าสุด</h2>
            </div>
            <Link href="/inbox" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              ดูทั้งหมด <ChevronRight size={13} />
            </Link>
          </div>
          <div className="divide-y divide-outline-variant/20">
            {recent.length === 0 && (
              <p className="px-5 py-8 text-sm text-on-surface-variant text-center">ไม่มีข้อมูล</p>
            )}
            {recent.map((c) => (
              <div key={c.id} className="px-5 py-3 hover:bg-primary/5 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/inbox/${c.id}`} className="text-sm font-medium hover:text-primary line-clamp-1 flex-1">
                    {c.title}
                  </Link>
                  <UrgencyBadge level={c.urgencyLevel} />
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {c.registrationNo && (
                    <span className="font-mono text-xs text-primary font-bold">{c.registrationNo}</span>
                  )}
                  <span className="text-xs text-on-surface-variant">{c.organization?.name ?? "—"}</span>
                  <span className="text-xs text-on-surface-variant ml-auto">{formatThaiDateTime(c.receivedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Pending Outbound Approval */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/40">
            <div className="flex items-center gap-2">
              <Clock size={17} className="text-secondary" />
              <h2 className="font-bold text-on-surface text-sm">หนังสือออกรออนุมัติ</h2>
            </div>
            <Link href="/outbound?status=pending_approval" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              ดูทั้งหมด <ChevronRight size={13} />
            </Link>
          </div>
          <div className="divide-y divide-outline-variant/20">
            {pendingOutbound.length === 0 && (
              <p className="px-5 py-8 text-sm text-on-surface-variant text-center">ไม่มีรายการรออนุมัติ</p>
            )}
            {pendingOutbound.map((d) => (
              <div key={d.id} className="px-5 py-3 hover:bg-primary/5 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/outbound/${d.id}`} className="text-sm font-medium hover:text-primary line-clamp-1 flex-1">
                    {d.subject}
                  </Link>
                  <UrgencyBadge level={d.urgencyLevel} />
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-on-surface-variant">ถึง: {d.recipientOrg ?? "—"}</span>
                  {d.createdBy && (
                    <span className="text-xs text-on-surface-variant">โดย {d.createdBy.fullName}</span>
                  )}
                  <Link href={`/outbound/${d.id}`} className="ml-auto text-xs font-bold text-secondary hover:underline">
                    อนุมัติ →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* LINE Commands Reference */}
      <Card className="bg-gradient-to-br from-primary/5 to-secondary/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList size={16} className="text-primary" />
            <h3 className="font-bold text-sm text-on-surface">คำสั่ง LINE สำหรับผู้อำนวยการ</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { cmd: "ลงรับ #3", desc: "ลงรับหนังสือเลขที่ 3" },
              { cmd: "มอบหมาย #3", desc: "มอบหมายเรื่องที่ 3" },
              { cmd: "อนุมัติส่ง #5", desc: "อนุมัติหนังสือออกเลขที่ 5" },
              { cmd: "ทะเบียนรับ", desc: "ดูทะเบียนหนังสือเข้า" },
              { cmd: "ทะเบียนส่ง", desc: "ดูทะเบียนหนังสือออก" },
              { cmd: "รออนุมัติ", desc: "หนังสือออกรออนุมัติ" },
              { cmd: "ภาพรวม", desc: "สรุปภาพรวมวันนี้" },
              { cmd: "งานเกินกำหนด", desc: "งานที่เกินกำหนด" },
              { cmd: "งานของฉัน", desc: "งานที่ได้รับมอบหมาย" },
            ].map(({ cmd, desc }) => (
              <div key={cmd} className="bg-surface-bright rounded-xl px-3 py-2 border border-outline-variant/40">
                <code className="text-xs font-mono font-bold text-primary block">{cmd}</code>
                <p className="text-[10px] text-on-surface-variant mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, accent, href }: {
  label: string; value: number; sub: string;
  icon: React.ElementType; accent: string; href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-outline-variant/60 bg-surface-bright p-5 flex items-center gap-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all"
    >
      <div className={clsx("rounded-xl p-3 flex items-center justify-center", accent)}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-on-surface-variant">{label}</p>
        <p className="text-2xl font-bold text-on-surface">{value}</p>
        <p className="text-[10px] text-on-surface-variant">{sub}</p>
      </div>
    </Link>
  );
}

function QuickAction({ href, icon: Icon, label, color }: {
  href: string; icon: React.ElementType; label: string; color: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-outline-variant/60 bg-surface-bright hover:shadow-md hover:border-primary/40 transition-all text-center"
    >
      <div className={clsx("rounded-xl p-3", color)}>
        <Icon size={20} />
      </div>
      <span className="text-xs font-semibold text-on-surface">{label}</span>
    </Link>
  );
}
