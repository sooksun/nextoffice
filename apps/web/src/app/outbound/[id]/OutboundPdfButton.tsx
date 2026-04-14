"use client";

import { useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { toastError } from "@/lib/toast";
import { getToken } from "@/lib/auth";

interface Props {
  docId: number;
  documentNo: string | null;
}

export default function OutboundPdfButton({ docId, documentNo }: Props) {
  const [loading, setLoading] = useState<"view" | "download" | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  const fetchPdfBlob = async (): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`${apiBase}/outbound/documents/${docId}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  };

  const handleView = async () => {
    setLoading("view");
    try {
      const blob = await fetchPdfBlob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // Revoke URL after 60s to allow the new tab to load
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toastError((err as Error).message || "เปิด PDF ไม่สำเร็จ");
    } finally {
      setLoading(null);
    }
  };

  const handleDownload = async () => {
    setLoading("download");
    try {
      const blob = await fetchPdfBlob();
      const url = URL.createObjectURL(blob);
      const filename = documentNo
        ? `หนังสือส่ง-${documentNo.replace(/[\/\s]/g, "-")}.pdf`
        : `outbound-${docId}.pdf`;
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
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleView}
        disabled={loading !== null}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-on-primary shadow-md shadow-primary/20 hover:brightness-105 active:scale-95 transition-all disabled:opacity-60"
      >
        {loading === "view" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <FileText size={16} />
        )}
        {loading === "view" ? "กำลังสร้าง..." : "ดู PDF"}
      </button>

      <button
        onClick={handleDownload}
        disabled={loading !== null}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-outline-variant/30 text-on-surface-variant hover:bg-surface-bright active:scale-95 transition-all disabled:opacity-60"
      >
        {loading === "download" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Download size={16} />
        )}
        {loading === "download" ? "กำลังดาวน์โหลด..." : "ดาวน์โหลด"}
      </button>
    </div>
  );
}
