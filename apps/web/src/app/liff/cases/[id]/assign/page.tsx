"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { useLiff } from "../../../LiffBoot";

interface StaffUser {
  id: number | string;
  fullName: string;
  roleCode: string;
  positionTitle: string | null;
}

interface CaseBrief {
  id: number;
  title: string;
  registrationNo: string | null;
  directorNote: string | null;
}

export default function LiffAssignPage() {
  const { status: liffStatus } = useLiff();
  const params = useParams();
  const router = useRouter();
  const caseId = params.id as string;

  const [caseData, setCaseData] = useState<CaseBrief | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [directorNote, setDirectorNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    if (liffStatus !== "ready") return;
    const u = JSON.parse(localStorage.getItem("user") ?? "null");
    setMe(u);

    Promise.all([
      apiFetch<CaseBrief>(`/cases/${caseId}`).catch(() => null),
      apiFetch<StaffUser[] | { data: StaffUser[] }>(`/staff-config`).catch(() => []),
    ])
      .then(([c, s]) => {
        if (c) {
          setCaseData(c);
          setDirectorNote(c.directorNote ?? "ดำเนินการตามเสนอ");
        }
        const arr = Array.isArray(s) ? s : (s as any).data ?? [];
        setStaff(arr);
      })
      .finally(() => setLoading(false));
  }, [caseId, liffStatus]);

  const canAssign = me && ["DIRECTOR", "VICE_DIRECTOR", "CLERK", "ADMIN"].includes(me.roleCode);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        (s.positionTitle ?? "").toLowerCase().includes(q),
    );
  }, [staff, search]);

  const toggle = (userId: number) => {
    const n = new Set(selected);
    if (n.has(userId)) n.delete(userId);
    else n.add(userId);
    setSelected(n);
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return toast.error("กรุณาเลือกผู้รับผิดชอบอย่างน้อย 1 คน");
    if (!directorNote.trim()) return toast.error("กรุณาระบุคำสั่ง");
    setSubmitting(true);
    try {
      await apiFetch(`/cases/${caseId}/assign`, {
        method: "POST",
        body: JSON.stringify({
          assignments: Array.from(selected).map((userId) => ({ userId, role: "responsible" })),
          directorNote: directorNote.trim(),
        }),
      });
      toast.success("มอบหมายสำเร็จ");
      router.push(`/liff/cases/${caseId}`);
    } catch (e: any) {
      toast.error(e.message ?? "ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-sm text-slate-500">กำลังโหลด…</div>;
  if (!caseData) return <div className="p-6 text-center text-sm text-slate-500">ไม่พบข้อมูล</div>;
  if (!canAssign)
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        คุณไม่มีสิทธิ์มอบหมายงาน
        <br />
        <Link href={`/liff/cases/${caseId}`} className="text-indigo-600 underline">
          กลับ
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-md px-4 py-4 pb-32">
      <Link href={`/liff/cases/${caseId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <h1 className="mb-1 text-lg font-semibold">มอบหมายงาน</h1>
      <p className="mb-4 line-clamp-2 text-xs text-slate-500">{caseData.title}</p>

      <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-semibold">คำสั่ง / บันทึกเสนอ</label>
        <textarea
          value={directorNote}
          onChange={(e) => setDirectorNote(e.target.value)}
          rows={3}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          placeholder="เช่น ดำเนินการตามเสนอ"
        />
      </div>

      <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-semibold">
          ผู้รับผิดชอบ ({selected.size} คน)
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ / ตำแหน่ง"
          className="mb-2 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">ไม่พบรายชื่อ</p>
          ) : (
            filtered.map((s) => {
              const uid = Number(s.id);
              const isSelected = selected.has(uid);
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(uid)}
                  className={`flex w-full items-center gap-2 rounded-lg border p-2.5 text-left active:scale-[0.99] ${
                    isSelected ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                      isSelected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"
                    }`}
                  >
                    {isSelected && "✓"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800">{s.fullName}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {s.positionTitle ?? s.roleCode}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            onClick={handleSubmit}
            disabled={submitting || selected.size === 0}
            className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "กำลังมอบหมาย…" : `ยืนยันมอบหมาย ${selected.size > 0 ? `(${selected.size} คน)` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
