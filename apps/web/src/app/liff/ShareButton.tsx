"use client";

import { useState } from "react";
import { toast } from "react-toastify";

interface Props {
  /** Short description text sent to the picker (max ~500 chars) */
  text: string;
  /** Optional URL to include */
  url?: string;
  /** Button label */
  label?: string;
  /** Additional className for the button */
  className?: string;
}

/**
 * LIFF Share Target button — uses liff.shareTargetPicker to let the user
 * forward a text/link message to friends/groups in LINE.
 *
 * Falls back to Web Share API if LIFF is not available (e.g. opened outside LINE).
 * Falls back to clipboard copy if neither works.
 */
export default function ShareButton({ text, url, label = "📤 แชร์", className = "" }: Props) {
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const messageText = url ? `${text}\n\n${url}` : text;

      // Prefer LIFF shareTargetPicker when inside LINE
      try {
        const liffModule = await import("@line/liff");
        const liff = liffModule.default;
        if (liff.isApiAvailable && liff.isApiAvailable("shareTargetPicker")) {
          const res = await liff.shareTargetPicker([{ type: "text", text: messageText }]);
          if (res) {
            toast.success("ส่งข้อความแล้ว");
          }
          return;
        }
      } catch {
        /* fall through */
      }

      // Web Share API fallback
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ text, url });
        return;
      }

      // Clipboard fallback
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(messageText);
        toast.info("คัดลอกข้อความแล้ว");
      }
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (!msg.includes("cancel")) {
        toast.error("แชร์ไม่สำเร็จ");
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={sharing}
      className={
        className ||
        "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 active:scale-[0.98] disabled:opacity-50"
      }
    >
      {sharing ? "กำลังแชร์…" : label}
    </button>
  );
}
