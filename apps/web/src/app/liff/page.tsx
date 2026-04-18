"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useLiff } from "./LiffBoot";

interface MyTask {
  id: number;
  caseId: number;
  caseTitle: string;
  urgencyLevel: string | null;
  dueDate: string | null;
  status: string;
  registrationNo: string | null;
}

interface PendingSign {
  id: number;
  title: string;
  documentNo: string | null;
  registrationNo: string | null;
  createdAt: string;
  urgencyLevel: string | null;
}

interface PendingOutbound {
  id: number;
  subject: string;
  urgencyLevel: string;
  letterType: string;
  createdAt: string;
  recipientOrg: string | null;
  recipientName: string | null;
}

interface TodayAttendance {
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string | null;
}

export default function LiffDashboardPage() {
  const { displayName, pictureUrl, status } = useLiff();
  const [user, setUser] = useState<any>(null);
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [pendingSign, setPendingSign] = useState<PendingSign[]>([]);
  const [pendingOutbound, setPendingOutbound] = useState<PendingOutbound[]>([]);
  const [today, setToday] = useState<TodayAttendance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "ready") return;
    const u = JSON.parse(localStorage.getItem("user") ?? "null");
    setUser(u);

    (async () => {
      try {
        const [tasks, attendance] = await Promise.all([
          apiFetch<MyTask[]>("/cases/my-tasks").catch(() => []),
          apiFetch<TodayAttendance>("/attendance/today").catch(() => null),
        ]);
        setMyTasks(Array.isArray(tasks) ? tasks : []);
        setToday(attendance);

        if (["DIRECTOR", "VICE_DIRECTOR", "ADMIN"].includes(u?.roleCode)) {
          const [pending, outbound] = await Promise.all([
            apiFetch<PendingSign[]>("/cases/pending-director-signing").catch(() => []),
            apiFetch<PendingOutbound[] | { data: PendingOutbound[] }>(
              "/outbound/my/documents?status=pending_approval",
            ).catch(() => []),
          ]);
          setPendingSign(Array.isArray(pending) ? pending : []);
          const outArr = Array.isArray(outbound) ? outbound : (outbound as any).data ?? [];
          setPendingOutbound(outArr);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [status]);

  const isDirector = user && ["DIRECTOR", "VICE_DIRECTOR", "ADMIN"].includes(user.roleCode);

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        {pictureUrl && (
          <img src={pictureUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        )}
        <div>
          <p className="text-xs text-slate-500">สวัสดี</p>
          <p className="text-base font-semibold">{user?.fullName ?? displayName ?? "-"}</p>
          <p className="text-xs text-slate-500">{user?.positionTitle ?? user?.roleCode}</p>
        </div>
      </header>

      {loading ? (
        <div className="text-center text-sm text-slate-500">กำลังโหลด…</div>
      ) : (
        <>
          <AttendanceCard today={today} />

          {/* Quick links */}
          <div className="mb-6 grid grid-cols-2 gap-2">
            <Link
              href="/liff/leave"
              className="rounded-lg border border-slate-200 bg-white p-3 text-center text-sm font-medium text-slate-700 shadow-sm active:scale-[0.98]"
            >
              📝 ใบลา
            </Link>
            <Link
              href="/liff/travel"
              className="rounded-lg border border-slate-200 bg-white p-3 text-center text-sm font-medium text-slate-700 shadow-sm active:scale-[0.98]"
            >
              🚗 ไปราชการ
            </Link>
            <Link
              href="/liff/news"
              className="rounded-lg border border-slate-200 bg-white p-3 text-center text-sm font-medium text-slate-700 shadow-sm active:scale-[0.98]"
            >
              📣 ประกาศ
            </Link>
            <Link
              href="/liff/calendar"
              className="rounded-lg border border-slate-200 bg-white p-3 text-center text-sm font-medium text-slate-700 shadow-sm active:scale-[0.98]"
            >
              📅 ปฏิทิน 7 วัน
            </Link>
            <Link
              href="/liff/attendance/history"
              className="rounded-lg border border-slate-200 bg-white p-3 text-center text-sm font-medium text-slate-700 shadow-sm active:scale-[0.98]"
            >
              🕒 ประวัติลงเวลา
            </Link>
            <Link
              href="/liff/signature"
              className="rounded-lg border border-slate-200 bg-white p-3 text-center text-sm font-medium text-slate-700 shadow-sm active:scale-[0.98]"
            >
              ✍ ลายเซ็น
            </Link>
            <Link
              href="/liff/face-register"
              className="rounded-lg border border-slate-200 bg-white p-3 text-center text-sm font-medium text-slate-700 shadow-sm active:scale-[0.98]"
            >
              ลงทะเบียนใบหน้า
            </Link>
          </div>

          {isDirector && (
            <>
              <Section title="รออนุมัติส่ง" count={pendingOutbound.length}>
                {pendingOutbound.length === 0 ? (
                  <Empty>ไม่มีหนังสือรออนุมัติส่ง</Empty>
                ) : (
                  pendingOutbound.map((o) => (
                    <CaseCard
                      key={o.id}
                      href={`/liff/outbound/${o.id}`}
                      title={o.subject}
                      subtitle={o.recipientName ?? o.recipientOrg ?? ""}
                      urgency={o.urgencyLevel}
                      date={o.createdAt}
                      action="อนุมัติ"
                    />
                  ))
                )}
              </Section>

              <Section title="รอลงนาม" count={pendingSign.length}>
                {pendingSign.length === 0 ? (
                  <Empty>ไม่มีหนังสือรอลงนาม</Empty>
                ) : (
                  pendingSign.map((c) => (
                    <CaseCard
                      key={c.id}
                      href={`/liff/sign/${c.id}`}
                      title={c.title}
                      subtitle={c.registrationNo ?? c.documentNo ?? ""}
                      urgency={c.urgencyLevel}
                      date={c.createdAt}
                      action="ลงนาม"
                    />
                  ))
                )}
              </Section>
            </>
          )}

          <Section title="งานของฉัน" count={myTasks.length}>
            {myTasks.length === 0 ? (
              <Empty>ไม่มีงานค้าง 🎉</Empty>
            ) : (
              myTasks.map((t) => (
                <CaseCard
                  key={t.id}
                  href={`/liff/cases/${t.caseId}`}
                  title={t.caseTitle}
                  subtitle={t.registrationNo ?? ""}
                  urgency={t.urgencyLevel}
                  date={t.dueDate}
                  action="ดูรายละเอียด"
                />
              ))
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function CaseCard({
  href,
  title,
  subtitle,
  urgency,
  date,
  action,
}: {
  href: string;
  title: string;
  subtitle: string;
  urgency: string | null;
  date: string | null;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:scale-[0.99]"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="line-clamp-2 flex-1 text-sm font-medium text-slate-800">{title}</p>
        {urgency && <UrgencyBadge level={urgency} />}
      </div>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-2 flex items-center justify-between">
        {date && (
          <p className="text-xs text-slate-400">
            {new Date(date).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
          </p>
        )}
        <span className="text-xs font-medium text-green-600">{action} →</span>
      </div>
    </Link>
  );
}

function UrgencyBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    most_urgent: "bg-rose-100 text-rose-700",
    urgent: "bg-amber-100 text-amber-700",
    normal: "bg-slate-100 text-slate-600",
  };
  const labels: Record<string, string> = {
    most_urgent: "ด่วนมาก",
    urgent: "ด่วน",
    normal: "ปกติ",
  };
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[level] ?? colors.normal}`}>
      {labels[level] ?? level}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-500">{children}</div>;
}

function AttendanceCard({ today }: { today: TodayAttendance | null }) {
  const checkedIn = !!today?.checkInAt;
  const checkedOut = !!today?.checkOutAt;

  if (checkedOut) {
    return (
      <section className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <p className="text-xs font-semibold text-emerald-800">ลงเวลาวันนี้ครบแล้ว ✓</p>
        <p className="mt-1 text-xs text-emerald-700">
          เข้า{" "}
          {new Date(today!.checkInAt!).toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · ออก{" "}
          {new Date(today!.checkOutAt!).toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </section>
    );
  }

  if (checkedIn) {
    return (
      <Link
        href="/liff/checkin?mode=out"
        className="mb-6 block rounded-lg border border-indigo-200 bg-indigo-50 p-3 active:scale-[0.99]"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-indigo-800">เข้างานแล้ว</p>
            <p className="mt-0.5 text-xs text-indigo-700">
              เมื่อ{" "}
              {new Date(today!.checkInAt!).toLocaleTimeString("th-TH", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <span className="text-sm font-semibold text-indigo-700">ลงเวลาออก →</span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href="/liff/checkin?mode=in"
      className="mb-6 block rounded-lg border border-emerald-300 bg-emerald-600 p-4 text-center shadow-sm active:scale-[0.99]"
    >
      <p className="text-base font-semibold text-white">📸 ลงเวลาเข้างาน</p>
      <p className="mt-1 text-xs text-emerald-100">ถ่ายรูปใบหน้า + ตำแหน่งที่ตั้ง</p>
    </Link>
  );
}
