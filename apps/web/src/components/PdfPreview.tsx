"use client";

import { useEffect, useState } from "react";
import { Paperclip, ExternalLink, FileImage } from "lucide-react";

interface PdfPreviewProps {
  src: string;
  mimeType: string;
  fileName: string | null;
}

export default function PdfPreview({ src, mimeType, fileName }: PdfPreviewProps) {
  const [cacheBust, setCacheBust] = useState<number>(0);

  useEffect(() => {
    const handler = () => setTimeout(() => setCacheBust(Date.now()), 5000);
    window.addEventListener("assign-success", handler);
    return () => window.removeEventListener("assign-success", handler);
  }, []);

  const url = cacheBust ? `${src}${src.includes("?") ? "&" : "?"}t=${cacheBust}` : src;

  return (
    <div className="px-5 pt-5 pb-4">
      <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3 flex items-center gap-2">
        <Paperclip size={14} />
        เอกสารไฟล์ต้นฉบับ
        {fileName && (
          <span className="text-xs font-normal text-outline normal-case ml-1">({fileName})</span>
        )}
      </h2>

      {mimeType === "application/pdf" ? (
        <div className="space-y-3">
          <iframe
            key={url}
            src={url}
            className="w-full rounded-xl border border-outline-variant/20"
            style={{ height: "640px" }}
            title="เอกสารต้นฉบับ"
          />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline"
          >
            <ExternalLink size={14} />
            เปิดใน PDF viewer
          </a>
        </div>
      ) : mimeType.startsWith("image/") ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={url}
            src={url}
            alt="เอกสารต้นฉบับ"
            className="max-w-full rounded-xl border border-outline-variant/20 object-contain bg-surface-bright"
            style={{ maxHeight: "640px" }}
          />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline"
          >
            <FileImage size={14} />
            ดูภาพขนาดเต็ม
          </a>
        </div>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
        >
          <ExternalLink size={14} />
          ดาวน์โหลดไฟล์
        </a>
      )}
    </div>
  );
}
