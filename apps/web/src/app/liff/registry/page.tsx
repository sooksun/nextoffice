"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useLiff } from "../LiffBoot";

interface CaseItem {
  id: number;
  title: string;
  status: string;
  registrationNo: string | null;
  urgencyLevel: string;
  receivedAt: string | null;
  dueDate: string | null;
}

type FilterKey = "all" | "today" | "urgent" | "pending";

const FILTER_LABEL: Record<FilterKey, string> = {
  all: "ทั้งหมด",
  today: "วันนี้",
  urgent: "ด่วน",
  pending: "รอดำเนินการ",
};

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่",
  analyzing: "วิเคราะห์",
  proposed: "เสนอแนะ",
  registered: "ลงรับ",
  assigned: "มอบหมาย",
  in_progress: "ดำเนินการ",
  completed: "เสร็จแล้ว",
};

function buildQuery(filter: FilterKey, search: string): string {
  const params = new URLSearchParams();
  params.set("take", "50");
  if (search.trim()) params.set("search", search.trim());
  switch (filter) {
    case "today": {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      params.set("dateFrom", from);
      break;
    }
    case "urgent":
      params.set("urgencyLevel", "very_urgent,most_urgent,urgent");
      break;
    case "pending":
      params.set("status", "registered,assigned,in_progress");
      break;
  }
  return params.toString();
}

export default function LiffRegistryPage() {
  const { status } = useLiff();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "ready") return;
    setLoading(true);
    const q = buildQuery(filter, search);
    apiFetch<{ data: CaseItem[] } | CaseItem[]>(`/cases?${q}`)
      .then((res) => {
        const arr = Array.isArray(res) ? res : (res as any).data ?? [];
        setCases(arr);
      })
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, [status, filter, search]);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <h1 className="mb-3 text-lg font-semibold">ทะเบียนรับ</h1>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ค้นหาชื่อเรื่อง / เลขรับ"
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />

      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {(Object.keys(FILTER_LABEL) as FilterKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              filter === k
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {FILTER_LABEL[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">กำลังโหลด…</div>
      ) : cases.length === 0 ? (
        <div className="rounded-lg bg-white p-8 text-center text-sm text-slate-500">
          ไม่พบหนังสือในหมวดนี้
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => (
            <Link
              key={c.id}
              href={`/liff/cases/${c.id}`}
              className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:scale-[0.99]"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="line-clamp-2 flex-1 text-sm font-medium text-slate-800">{c.title}</p>
                {c.urgencyLevel && c.urgencyLevel !== "normal" && (
                  <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                    {c.urgencyLevel === "most_urgent" || c.urgencyLevel === "very_urgent" ? "ด่วนมาก" : "ด่วน"}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {c.registrationNo ?? "-"}
                  {c.receivedAt && (
                    <> · {new Date(c.receivedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</>
                  )}
                </p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
