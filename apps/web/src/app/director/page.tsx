"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import {
  Inbox, SendHorizontal, CheckCircle, AlertTriangle,
  CalendarDays, Users, ClipboardList, ChevronRight, Clock, PenLine
} from "lucide-react";
import { formatThaiDateTime } from "@/lib/thai-date";

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

const URGENCY_COLOR: Record<string, string> = {
  normal: "bg-blue-100 text-blue-800",
  urgent: "bg-yellow-100 text-yellow-800",
  very_urgent: "bg-orange-100 text-orange-800",
  most_urgent: "bg-red-100 text-red-800",
};
const URGENCY_LABEL: Record<string, string> = {
  normal: "ปกติ", urgent: "ด่วน", very_urgent: "ด่วนที่สุด", most_urgent: "ด่วนที่สุด",
};

export default function DirectorDashboard() {
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [recentCases, setRecentCases] = useState<RecentCase[]>([]);
  const [pendingOutbound, setPendingOutbound] = useState<PendingOutbound[]>([]);
  const [pendingSigningCount, setPendingSigningCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: number; fullName: string; organizationId: number; roleCode: string } | null>(null);

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    setUser(u);
    if (!u.organizationId) { setLoading(false); return; }
    const orgId = u.organizationId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    Promise.allSettled([
      apiFetch<{ total: number; data: RecentCase[] }>(`/cases?take=5`),
      apiFetch<{ total: number; data: RecentCase[] }>(`/cases?take=200`),
      apiFetch<{ total: number; data: RecentCase[] }>(`/cases?status=new&take=200`).catch(() => ({ total: 0, data: [] })),
      apiFetch<PendingOutbound[]>(`/outbound/${orgId}/documents?status=pending_approval`).catch(() => []),
      apiFetch<PendingOutbound[]>(`/outbound/${orgId}/documents?status=draft`).catch(() => []),
      apiFetch<{ total: number; data: RecentCase[] }>(`/cases?dateFrom=${todayStr}&take=50`).catch(() => ({ total: 0, data: [] })),
      apiFetch<any[]>(`/cases/pending-director-signing`).catch(() => []),
    ]).then(([recentRes, allRes, pendingRes, pendingOutRes, draftOutRes, todayRes, pendingSignRes]) => {
      const recent = recentRes.status === "fulfilled" ? (recentRes.value as any).data ?? [] : [];
      const all = allRes.status === "fulfilled" ? allRes.value as any : { total: 0 };
      const pendingCases = pendingRes.status === "fulfilled" ? (pendingRes.value as any) : { total: 0 };
      const pendingOut = pendingOutRes.status === "fulfilled" ? pendingOutRes.value as PendingOutbound[] : [];
      const draftOut = draftOutRes.status === "fulfilled" ? draftOutRes.value as PendingOutbound[] : [];
      const todayIn = todayRes.status === "fulfilled" ? (todayRes.value as any) : { total: 0 };

      const pendingSign = pendingSignRes.status === "fulfilled" ? pendingSignRes.value as any[] : [];
      setPendingSigningCount(Array.isArray(pendingSign) ? pendingSign.length : 0);
      setRecentCases(recent);
      setPendingOutbound(pendingOut);
      setStats({
        inboundTotal: all.total ?? 0,
        inboundToday: todayIn.total ?? 0,
        inboundPending: pendingCases.total ?? 0,
        outboundDraft: Array.isArray(draftOut) ? draftOut.length : 0,
        outboundPendingApproval: Array.isArray(pendingOut) ? pendingOut.length : 0,
        outboundSentToday: 0,
        leavePending: 0,
        overdueCases: 0,
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-on-surface-variant text-sm animate-pulse">กำลังโหลดข้อมูล...</div>
      </div>
    );
  }

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
          value={stats?.inboundTotal ?? 0}
          sub={`วันนี้ ${stats?.inboundToday ?? 0} ฉบับ`}
          icon={Inbox}
          accent="text-primary bg-primary/10"
          href="/inbox"
        />
        <StatCard
          label="รอดำเนินการ"
          value={stats?.inboundPending ?? 0}
          sub="หนังสือเข้าใหม่"
          icon={AlertTriangle}
          accent="text-orange-600 bg-orange-100"
          href="/inbox"
        />
        <StatCard
          label="รออนุมัติส่ง"
          value={stats?.outboundPendingApproval ?? 0}
          sub={`ร่าง ${stats?.outboundDraft ?? 0} ฉบับ`}
          icon={CheckCircle}
          accent="text-secondary bg-secondary/10"
          href="/outbound?status=pending_approval"
        />
        <StatCard
          label="รอลงนาม ผอ."
          value={pendingSigningCount}
          sub="หนังสือรอเกษียณ"
          icon={PenLine}
          accent="text-violet-600 bg-violet-100"
          href="/director/signing"
        />
        <StatCard
          label="ใบลารออนุมัติ"
          value={stats?.leavePending ?? 0}
          sub="รอการพิจารณา"
          icon={CalendarDays}
          accent="text-tertiary bg-tertiary/10"
          href="/leave/approvals"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickAction href="/inbox" icon={Inbox} label="ดูหนังสือเข้า" color="bg-primary/10 text-primary" />
        <QuickAction href="/outbound/new" icon={SendHorizontal} label="สร้างหนังสือออก" color="bg-secondary/10 text-secondary" />
        <QuickAction href="/director/signing" icon={PenLine} label="ลงนามเกษียณ" color="bg-violet-100 text-violet-600" />
        <QuickAction href="/outbound" icon={CheckCircle} label="อนุมัติหนังสือ" color="bg-green-100 text-green-700" />
        <QuickAction href="/leave/approvals" icon={CalendarDays} label="อนุมัติใบลา" color="bg-tertiary/10 text-tertiary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Inbound */}
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/20 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
            <div className="flex items-center gap-2">
              <Inbox size={17} className="text-primary" />
              <h2 className="font-bold text-on-surface text-sm">หนังสือเข้าล่าสุด</h2>
            </div>
            <Link href="/inbox" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              ดูทั้งหมด <ChevronRight size={13} />
            </Link>
          </div>
          <div className="divide-y divide-outline-variant/10">
            {recentCases.length === 0 && (
              <p className="px-5 py-8 text-sm text-on-surface-variant text-center">ไม่มีข้อมูล</p>
            )}
            {recentCases.map((c) => (
              <div key={c.id} className="px-5 py-3 hover:bg-surface-bright/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/inbox/${c.id}`} className="text-sm font-medium hover:text-primary line-clamp-1 flex-1">
                    {c.title}
                  </Link>
                  <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${URGENCY_COLOR[c.urgencyLevel] ?? URGENCY_COLOR.normal}`}>
                    {URGENCY_LABEL[c.urgencyLevel] ?? c.urgencyLevel}
                  </span>
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
        </div>

        {/* Pending Outbound Approval */}
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/20 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
            <div className="flex items-center gap-2">
              <Clock size={17} className="text-secondary" />
              <h2 className="font-bold text-on-surface text-sm">หนังสือออกรออนุมัติ</h2>
            </div>
            <Link href="/outbound?status=pending_approval" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              ดูทั้งหมด <ChevronRight size={13} />
            </Link>
          </div>
          <div className="divide-y divide-outline-variant/10">
            {pendingOutbound.length === 0 && (
              <p className="px-5 py-8 text-sm text-on-surface-variant text-center">ไม่มีรายการรออนุมัติ</p>
            )}
            {pendingOutbound.map((d) => (
              <div key={d.id} className="px-5 py-3 hover:bg-surface-bright/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/outbound/${d.id}`} className="text-sm font-medium hover:text-primary line-clamp-1 flex-1">
                    {d.subject}
                  </Link>
                  <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${URGENCY_COLOR[d.urgencyLevel] ?? URGENCY_COLOR.normal}`}>
                    {URGENCY_LABEL[d.urgencyLevel] ?? d.urgencyLevel}
                  </span>
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
        </div>
      </div>

      {/* LINE Commands Reference */}
      <div className="bg-gradient-to-br from-primary/5 to-secondary/5 rounded-2xl border border-outline-variant/20 p-5">
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
            <div key={cmd} className="bg-surface-lowest rounded-xl px-3 py-2 border border-outline-variant/10">
              <code className="text-xs font-mono font-bold text-primary block">{cmd}</code>
              <p className="text-[10px] text-on-surface-variant mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, accent, href }: {
  label: string; value: number; sub: string;
  icon: React.ElementType; accent: string; href: string;
}) {
  return (
    <Link href={href} className="bg-surface-lowest rounded-2xl border border-outline-variant/20 p-5 flex items-center gap-4 shadow-sm hover:shadow-md hover:border-outline-variant/30 transition-all">
      <div className={`rounded-xl p-3 ${accent}`}>
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
    <Link href={href} className="flex flex-col items-center gap-2 p-4 bg-surface-lowest rounded-2xl border border-outline-variant/20 hover:shadow-md hover:border-outline-variant/30 transition-all text-center">
      <div className={`rounded-xl p-3 ${color}`}>
        <Icon size={20} />
      </div>
      <span className="text-xs font-semibold text-on-surface">{label}</span>
    </Link>
  );
}
