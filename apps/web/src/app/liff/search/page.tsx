"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useLiff } from "../LiffBoot";

interface CaseItem {
  id: number;
  title: string;
  status: string;
  urgencyLevel: string | null;
  registrationNo: string | null;
  documentNo: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่",
  analyzing: "กำลังวิเคราะห์",
  proposed: "มีข้อเสนอ",
  registered: "ลงรับแล้ว",
  assigned: "มอบหมายแล้ว",
  in_progress: "กำลังทำ",
  completed: "เสร็จแล้ว",
};

export default function LiffSearchPage() {
  const { status } = useLiff();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await apiFetch<CaseItem[] | { data: CaseItem[] }>(
        `/cases?search=${encodeURIComponent(query)}&take=30`,
      );
      const arr = Array.isArray(data) ? data : (data as any).data ?? [];
      setResults(arr);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce while typing
  useEffect(() => {
    if (status !== "ready") return;
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(() => doSearch(q), 400);
    return () => clearTimeout(t);
  }, [q, status, doSearch]);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <h1 className="mb-3 text-lg font-semibold">ค้นหาหนังสือ</h1>

      <div className="mb-4">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="พิมพ์เลขที่หนังสือ หรือ หัวเรื่อง…"
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          autoFocus
        />
        <p className="mt-1 text-xs text-slate-400">
          เช่น &quot;กสศ. 0645&quot;, &quot;ประชุม&quot;, &quot;จัดสรรงบประมาณ&quot;
        </p>
      </div>

      {loading && <div className="text-center text-sm text-slate-500">กำลังค้นหา…</div>}

      {!loading && searched && results.length === 0 && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-500">
          ไม่พบหนังสือที่ตรงกับคำค้น
        </div>
      )}

      <div className="space-y-2">
        {results.map((c) => (
          <Link
            key={c.id}
            href={`/liff/cases/${c.id}`}
            className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:scale-[0.99]"
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="line-clamp-2 flex-1 text-sm font-medium text-slate-800">{c.title}</p>
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                {STATUS_LABEL[c.status] ?? c.status}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {c.registrationNo ? `ทะเบียน: ${c.registrationNo}` : c.documentNo ?? ""}
              </span>
              <span>{new Date(c.createdAt).toLocaleDateString("th-TH")}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
