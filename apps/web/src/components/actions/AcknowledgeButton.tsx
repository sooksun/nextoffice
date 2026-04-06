"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { CheckCircle } from "lucide-react";

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

export default function AcknowledgeButton({ assignments }: Props) {
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

  const myPending = assignments.find(
    (a) => a.assignedTo.id === currentUserId && a.status === "pending"
  );

  if (!myPending) return null;

  const handleAcknowledge = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await apiFetch(`/cases/assignments/${myPending.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "accepted" }),
      });
      toastSuccess("รับทราบสำเร็จ");
      router.refresh();
    } catch (err: unknown) {
      toastError((err as Error).message || "รับทราบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleAcknowledge}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold shadow-md transition-transform active:scale-95 disabled:opacity-50"
    >
      <CheckCircle size={16} />
      {loading ? "กำลังดำเนินการ..." : "รับทราบ"}
    </button>
  );
}
