"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError, confirmToast } from "@/lib/toast";
import { CheckCircle, Send } from "lucide-react";

const SENT_METHOD_LABEL: Record<string, string> = {
  email: "อีเมล",
  line: "LINE",
  paper: "ส่งเอกสาร (กระดาษ)",
};

interface Props {
  docId: number;
  status: string;
  sentMethod: string | null;
  recipientEmail: string | null;
}

export default function OutboundActions({ docId, status, sentMethod, recipientEmail }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState(sentMethod || (recipientEmail ? "email" : "paper"));

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
    } catch (err: unknown) {
      toastError((err as Error).message || "อนุมัติไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (loading) return;
    const methodLabel = SENT_METHOD_LABEL[method] ?? method;
    const emailNote = method === "email" && recipientEmail ? ` (${recipientEmail})` : "";
    if (!(await confirmToast(`ยืนยันส่งเอกสารทาง${methodLabel}${emailNote}?`))) return;
    setLoading(true);
    try {
      await apiFetch(`/outbound/documents/${docId}/send`, {
        method: "POST",
        body: JSON.stringify({ sentMethod: method }),
      });
      toastSuccess("ส่งเอกสารสำเร็จ");
      router.refresh();
    } catch (err: unknown) {
      toastError((err as Error).message || "ส่งไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  if (status === "sent") return null;

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-surface-bright rounded-2xl border border-outline-variant/20">
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
        <>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="input-select text-sm"
          >
            <option value="email">📧 ส่งทางอีเมล</option>
            <option value="line">💬 ส่งทาง LINE</option>
            <option value="paper">📄 ส่งเอกสาร (กระดาษ)</option>
          </select>
          <button
            onClick={handleSend}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold shadow-md transition-transform active:scale-95 disabled:opacity-50"
          >
            <Send size={16} />
            {loading ? "กำลังส่ง..." : "ส่งเอกสาร"}
          </button>
        </>
      )}
    </div>
  );
}
