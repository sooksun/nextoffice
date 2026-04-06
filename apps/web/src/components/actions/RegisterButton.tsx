"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { ClipboardCheck } from "lucide-react";

interface Props {
  caseId: number;
  status: string;
}

export default function RegisterButton({ caseId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [regNo, setRegNo] = useState<string | null>(null);

  if (!["new", "analyzing", "proposed"].includes(status)) return null;

  const handleRegister = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ registrationNo: string }>(`/cases/${caseId}/register`, { method: "POST" });
      setRegNo(res.registrationNo);
      toastSuccess("ลงรับเอกสารสำเร็จ");
      router.refresh();
    } catch (err: unknown) {
      toastError((err as Error).message || "ลงรับไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  if (regNo) {
    return (
      <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-xl text-sm font-semibold">
        <ClipboardCheck size={16} />
        ลงรับแล้ว เลขรับ {regNo}
      </span>
    );
  }

  return (
    <button
      onClick={handleRegister}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold shadow-md transition-transform active:scale-95 disabled:opacity-50"
    >
      <ClipboardCheck size={16} />
      {loading ? "กำลังลงรับ..." : "ลงรับหนังสือ"}
    </button>
  );
}
