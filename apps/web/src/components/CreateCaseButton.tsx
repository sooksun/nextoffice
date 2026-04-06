"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { FilePlus, Loader2 } from "lucide-react";

interface Props {
  documentIntakeId: number;
}

export default function CreateCaseButton({ documentIntakeId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ caseId: number; status: string }>(
        `/cases/from-intake/${documentIntakeId}`,
        { method: "POST" },
      );
      router.push(`/inbox/${res.caseId}`);
    } catch (err: unknown) {
      toastError((err as Error).message || "สร้างเคสไม่สำเร็จ");
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCreate}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold transition-transform active:scale-95 disabled:opacity-50"
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <FilePlus size={12} />
      )}
      {loading ? "กำลังสร้าง..." : "สร้างเคส"}
    </button>
  );
}
