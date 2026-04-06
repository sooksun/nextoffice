"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastError, confirmToast } from "@/lib/toast";
import { CheckCheck } from "lucide-react";

interface Assignment {
  id: number;
  role: string;
  status: string;
  assignedTo: { id: number; fullName: string };
}

interface Props {
  caseId: number;
  assignments: Assignment[];
}

export default function CompleteButton({ assignments }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw);
        setCurrentUserId(u.id);
      }
    } catch {}
  }, []);

  const myActive = assignments.find(
    (a) => a.assignedTo.id === currentUserId && ["accepted", "in_progress"].includes(a.status)
  );

  if (!myActive) return null;

  const handleComplete = async () => {
    if (loading) return;
    if (!(await confirmToast("ยืนยันว่างานเสร็จสิ้นแล้ว?"))) return;
    setLoading(true);
    try {
      await apiFetch(`/cases/assignments/${myActive.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });
      router.refresh();
    } catch (err: unknown) {
      toastError((err as Error).message || "ดำเนินการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleComplete}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-tertiary text-on-tertiary rounded-xl text-sm font-bold shadow-md transition-transform active:scale-95 disabled:opacity-50"
    >
      <CheckCheck size={16} />
      {loading ? "กำลังดำเนินการ..." : "เสร็จแล้ว"}
    </button>
  );
}
