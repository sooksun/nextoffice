"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useLiff } from "../LiffBoot";

interface TravelRequest {
  id: number;
  travelDate: string;
  destination: string;
  purpose: string;
  departureTime: string | null;
  returnTime: string | null;
  status: string;
  createdAt: string;
  user?: { id: number; fullName: string };
}

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

export default function LiffTravelPage() {
  const { status } = useLiff();
  const [user, setUser] = useState<any>(null);
  const [my, setMy] = useState<TravelRequest[]>([]);
  const [pending, setPending] = useState<TravelRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "ready") return;
    const u = JSON.parse(localStorage.getItem("user") ?? "null");
    setUser(u);
    const canApprove = ["ADMIN", "DIRECTOR", "VICE_DIRECTOR"].includes(u?.roleCode);
    Promise.all([
      apiFetch<TravelRequest[]>("/attendance/leave/travel/my-requests").catch(() => []),
      canApprove
        ? apiFetch<TravelRequest[]>("/attendance/leave/travel/pending").catch(() => [])
        : Promise.resolve([]),
    ]).then(([mine, pend]) => {
      setMy(Array.isArray(mine) ? mine : []);
      setPending(Array.isArray(pend) ? pend : []);
      setLoading(false);
    });
  }, [status]);

  const canApprove = user && ["ADMIN", "DIRECTOR", "VICE_DIRECTOR"].includes(user.roleCode);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">ไปราชการ</h1>
        <Link
          href="/liff/travel/new"
          className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white active:scale-[0.98]"
        >
          + ขอไปราชการ
        </Link>
      </div>

      {loading ? (
        <div className="text-center text-sm text-slate-500">กำลังโหลด…</div>
      ) : (
        <>
          {canApprove && pending.length > 0 && (
            <Section title="รออนุมัติ" count={pending.length}>
              {pending.map((t) => (
                <TravelCard key={t.id} item={t} showRequester />
              ))}
            </Section>
          )}

          <Section title="ของฉัน" count={my.length}>
            {my.length === 0 ? (
              <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-500">
                ยังไม่มีคำขอไปราชการ
              </div>
            ) : (
              my.map((t) => <TravelCard key={t.id} item={t} />)
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

function TravelCard({
  item,
  showRequester = false,
}: {
  item: TravelRequest;
  showRequester?: boolean;
}) {
  const dateStr = new Date(item.travelDate).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
  return (
    <Link
      href={`/liff/travel/${item.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:scale-[0.99]"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="flex-1 text-sm font-medium text-slate-800">{item.destination}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            STATUS_COLOR[item.status] ?? STATUS_COLOR.draft
          }`}
        >
          {STATUS_LABEL[item.status] ?? item.status}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        {dateStr}
        {item.departureTime && <> · {item.departureTime}</>}
        {item.returnTime && <>–{item.returnTime}</>}
      </p>
      {showRequester && item.user?.fullName && (
        <p className="mt-1 text-xs text-slate-400">โดย {item.user.fullName}</p>
      )}
      {item.purpose && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.purpose}</p>
      )}
    </Link>
  );
}
