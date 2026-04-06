"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError, confirmToast } from "@/lib/toast";
import { CheckCircle, Send } from "lucide-react";

interface Props {
  docId: number;
  status: string;
}

export default function OutboundActions({ docId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      await apiFetch(`/outbound/documents/${docId}/approve`, {
        method: "POST",
        body: JSON.stringify({ approvedByUserId: user.id }),
      });
      toastSuccess("อนุมัติสำเร็จ");
      router.refresh();
    } catch (err: any) {
      toastError(err.message || "อนุมัติไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (loading) return;
    if (!(await confirmToast("ยืนยันการส่งเอกสาร?"))) return;
    setLoading(true);
    try {
      await apiFetch(`/outbound/documents/${docId}/send`, { method: "POST" });
      router.refresh();
    } catch (err: any) {
      toastError(err.message || "ส่งไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  if (status === "sent") return null;

  return (
    <div className="flex flex-wrap gap-3 mb-6 p-4 bg-surface-bright rounded-2xl border border-outline-variant/20">
      {status === "draft" && (
        <button
          onClick={handleApprove}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold shadow-md transition-transform active:scale-95 disabled:opacity-50"
        >
          <CheckCircle size={16} />
          {loading ? "กำลังดำเนินการ..." : "อนุมัติ (ได้เลขที่อัตโนมัติ)"}
        </button>
      )}
      {status === "approved" && (
        <button
          onClick={handleSend}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold shadow-md transition-transform active:scale-95 disabled:opacity-50"
        >
          <Send size={16} />
          {loading ? "กำลังส่ง..." : "ส่งเอกสาร"}
        </button>
      )}
    </div>
  );
}
