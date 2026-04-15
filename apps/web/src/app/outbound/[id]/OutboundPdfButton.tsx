"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toastError } from "@/lib/toast";
import { getToken } from "@/lib/auth";

interface Props {
  docId: number;
  documentNo: string | null;
}

export default function OutboundPdfButton({ docId, documentNo }: Props) {
  const [loading, setLoading] = useState(false);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  const handleDownloadWord = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/outbound/documents/${docId}/word`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename = documentNo
        ? `หนังสือส่ง-${documentNo.replace(/[\/\s]/g, "-")}.docx`
        : `outbound-${docId}.docx`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      toastError((err as Error).message || "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDownloadWord}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-on-primary shadow-md shadow-primary/20 hover:brightness-105 active:scale-95 transition-all disabled:opacity-60"
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <FileDown size={16} />
      )}
      {loading ? "กำลังสร้าง..." : "ดาวน์โหลด Word"}
    </button>
  );
}
