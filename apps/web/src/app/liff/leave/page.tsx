"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useLiff } from "../LiffBoot";

interface LeaveRequest {
  id: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  status: string;
  submittedAt: string | null;
  createdAt: string;
}

interface LeaveBalance {
  sick: number;
  personal: number;
  vacation: number;
  [key: string]: number;
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  sick: "ลาป่วย",
  personal: "ลากิจ",
  vacation: "ลาพักร้อน",
  maternity: "ลาคลอด",
  ordination: "ลาอุปสมบท",
  training: "ลาฝึกอบรม",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  pending: "รออนุมัติ",
  approved: "อนุมัติ",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function LiffLeavePage() {
  const { status } = useLiff();
  const [user, setUser] = useState<any>(null);
  const [my, setMy] = useState<LeaveRequest[]>([]);
  const [pending, setPending] = useState<LeaveRequest[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "ready") return;
    const u = JSON.parse(localStorage.getItem("user") ?? "null");
    setUser(u);

    const canApprove = ["ADMIN", "DIRECTOR", "VICE_DIRECTOR", "HEAD_TEACHER"].includes(
      u?.roleCode,
    );

    Promise.all([
      apiFetch<LeaveRequest[]>("/attendance/leave/my-requests").catch(() => []),
      apiFetch<LeaveBalance>("/attendance/leave/balance").catch(() => null),
      canApprove
        ? apiFetch<LeaveRequest[]>("/attendance/leave/pending").catch(() => [])
        : Promise.resolve([]),
    ]).then(([mine, bal, pend]) => {
      setMy(Array.isArray(mine) ? mine : []);
      setBalance(bal);
      setPending(Array.isArray(pend) ? pend : []);
      setLoading(false);
    });
  }, [status]);

  const canApprove =
    user && ["ADMIN", "DIRECTOR", "VICE_DIRECTOR", "HEAD_TEACHER"].includes(user.roleCode);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">ใบลา</h1>
        <Link
          href="/liff/leave/new"
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white active:scale-[0.98]"
        >
          + ขอลาใหม่
        </Link>
      </div>

      {loading ? (
        <div className="text-center text-sm text-slate-500">กำลังโหลด…</div>
      ) : (
        <>
          {/* Balance */}
          {balance && (
            <section className="mb-4 grid grid-cols-3 gap-2">
              <BalanceCard label="ลาป่วย" value={balance.sick ?? 0} />
              <BalanceCard label="ลากิจ" value={balance.personal ?? 0} />
              <BalanceCard label="พักร้อน" value={balance.vacation ?? 0} />
            </section>
          )}

          {/* Pending approvals for managers */}
          {canApprove && pending.length > 0 && (
            <Section title="รออนุมัติ" count={pending.length}>
              {pending.map((l) => (
                <LeaveCard key={l.id} leave={l} showRequester />
              ))}
            </Section>
          )}

          {/* My leaves */}
          <Section title="ใบลาของฉัน" count={my.length}>
            {my.length === 0 ? (
              <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-500">
                ยังไม่มีใบลา
              </div>
            ) : (
              my.map((l) => <LeaveCard key={l.id} leave={l} />)
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
          {count}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function BalanceCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-3 text-center shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-800">{value}</p>
      <p className="text-[10px] text-slate-400">วัน</p>
    </div>
  );
}

function LeaveCard({
  leave,
  showRequester = false,
}: {
  leave: LeaveRequest & { user?: { fullName: string } };
  showRequester?: boolean;
}) {
  const start = new Date(leave.startDate);
  const end = new Date(leave.endDate);
  const dateText =
    start.toDateString() === end.toDateString()
      ? start.toLocaleDateString("th-TH", { day: "numeric", month: "short" })
      : `${start.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}`;

  return (
    <Link
      href={`/liff/leave/${leave.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:scale-[0.99]"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="flex-1 text-sm font-medium text-slate-800">
          {LEAVE_TYPE_LABEL[leave.leaveType] ?? leave.leaveType}
          <span className="ml-2 text-xs text-slate-500">· {leave.totalDays} วัน</span>
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            STATUS_COLOR[leave.status] ?? STATUS_COLOR.draft
          }`}
        >
          {STATUS_LABEL[leave.status] ?? leave.status}
        </span>
      </div>
      <p className="text-xs text-slate-500">{dateText}</p>
      {showRequester && leave.user?.fullName && (
        <p className="mt-1 text-xs text-slate-400">โดย {leave.user.fullName}</p>
      )}
      {leave.reason && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{leave.reason}</p>
      )}
    </Link>
  );
}
