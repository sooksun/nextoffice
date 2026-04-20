"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError, confirmToast } from "@/lib/toast";
import { CheckCircle, Send, SendHorizontal, XCircle } from "lucide-react";
import { getUser } from "@/lib/auth";

const SENT_METHOD_LABEL: Record<string, string> = {
  email: "อีเมล",
  line: "LINE",
  paper: "ส่งเอกสาร (กระดาษ)",
};

const APPROVER_ROLES = ["ADMIN", "DIRECTOR", "VICE_DIRECTOR"];

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

  const user = typeof window !== "undefined" ? getUser() : null;
  const roleCode: string = (user as any)?.roleCode ?? "TEACHER";
  const isApprover = APPROVER_ROLES.includes(roleCode);

  const call = async (path: string, body?: object) => {
    setLoading(true);
    try {
      await apiFetch(`/outbound/documents/${docId}${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      await call("/submit");
      toastSuccess("เสนอขออนุมัติสำเร็จ — รอผู้มีอำนาจอนุมัติ");
    } catch (err: unknown) {
      toastError((err as Error).message || "เสนอขออนุมัติไม่สำเร็จ");
    }
  };

  const handleApprove = async () => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      await call("/approve", { approvedByUserId: u.id });
      toastSuccess("อนุมัติสำเร็จ — เอกสารได้รับเลขที่แล้ว");
    } catch (err: unknown) {
      toastError((err as Error).message || "อนุมัติไม่สำเร็จ");
    }
  };

  const handleReject = async () => {
    const note = window.prompt("หมายเหตุการส่งกลับ (ถ้ามี):");
    if (note === null) return;
    try {
      await apiFetch(`/outbound/documents/${docId}/reject`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      toastSuccess("ส่งกลับแก้ไขสำเร็จ");
      router.refresh();
    } catch (err: unknown) {
      toastError((err as Error).message || "ส่งกลับไม่สำเร็จ");
    }
  };

  const handleSend = async () => {
    const methodLabel = SENT_METHOD_LABEL[method] ?? method;
    const emailNote = method === "email" && recipientEmail ? ` (${recipientEmail})` : "";
    if (!(await confirmToast(`ยืนยันส่งเอกสารทาง${methodLabel}${emailNote}?`))) return;
    try {
      await call("/send", { sentMethod: method });
      toastSuccess("ส่งเอกสารสำเร็จ");
    } catch (err: unknown) {
      toastError((err as Error).message || "ส่งไม่สำเร็จ");
    }
  };

  if (status === "sent") return null;

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-surface-bright rounded-2xl border border-outline-variant/20">

      {/* draft: ผู้ไม่มีสิทธิ์อนุมัติ → เสนอขออนุมัติ */}
      {status === "draft" && !isApprover && (
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold shadow-md transition-transform active:scale-95 disabled:opacity-50"
        >
          <SendHorizontal size={16} />
          {loading ? "กำลังดำเนินการ..." : "เสนอขออนุมัติ"}
        </button>
      )}

      {/* draft: ผู้มีสิทธิ์อนุมัติ → อนุมัติได้โดยตรง */}
      {status === "draft" && isApprover && (
        <button
          onClick={handleApprove}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold shadow-md transition-transform active:scale-95 disabled:opacity-50"
        >
          <CheckCircle size={16} />
          {loading ? "กำลังดำเนินการ..." : "อนุมัติ (ได้เลขที่อัตโนมัติ)"}
        </button>
      )}

      {/* pending_approval: ผู้มีสิทธิ์อนุมัติ → อนุมัติ หรือ ส่งกลับ */}
      {status === "pending_approval" && isApprover && (
        <>
          <button
            onClick={handleApprove}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold shadow-md transition-transform active:scale-95 disabled:opacity-50"
          >
            <CheckCircle size={16} />
            {loading ? "กำลังอนุมัติ..." : "อนุมัติ (ออกเลขที่)"}
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 border border-red-500/40 text-red-600 dark:text-red-400 rounded-xl text-sm font-semibold hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            <XCircle size={16} />
            ส่งกลับแก้ไข
          </button>
        </>
      )}

      {/* pending_approval: ผู้ไม่มีสิทธิ์ → แสดง status เฉยๆ */}
      {status === "pending_approval" && !isApprover && (
        <span className="text-sm text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-2">
          <SendHorizontal size={15} />
          รอผู้มีอำนาจอนุมัติ
        </span>
      )}

      {/* approved → ส่งเอกสาร */}
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
