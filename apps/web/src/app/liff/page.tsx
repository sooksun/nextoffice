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

export default function LiffDashboardPage() {
  const { displayName, pictureUrl, status } = useLiff();
  const [user, setUser] = useState<any>(null);
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [pendingSign, setPendingSign] = useState<PendingSign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "ready") return;
    const u = JSON.parse(localStorage.getItem("user") ?? "null");
    setUser(u);

    (async () => {
      try {
        const tasks = await apiFetch<MyTask[]>("/cases/my-tasks");
        setMyTasks(Array.isArray(tasks) ? tasks : []);

        if (["DIRECTOR", "VICE_DIRECTOR", "ADMIN"].includes(u?.roleCode)) {
          const pending = await apiFetch<PendingSign[]>("/cases/pending-director-signing");
          setPendingSign(Array.isArray(pending) ? pending : []);
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
          {isDirector && (
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
