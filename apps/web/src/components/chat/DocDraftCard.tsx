"use client";

import Image from "next/image";
import { FileText, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import type { DocDraftPayload } from "./ChatBubble";

interface Props {
  draft: DocDraftPayload;
  onOpen: (draft: DocDraftPayload) => void;
}

/** การ์ดร่างเอกสารที่ AI สร้างจากแชท — แสดงข้อมูลที่กรอกให้, ที่ยังขาด และปุ่มเปิดฟอร์ม */
export function DocDraftCard({ draft, onOpen }: Props) {
  const hasMissing = draft.missingFields.length > 0;

  return (
    <div className="flex items-start gap-2">
      {/* Avatar */}
      <div className="shrink-0 w-6 h-6 rounded-lg bg-secondary flex items-center justify-center">
        <Image
          src="/Favicon.png"
          alt="AI"
          width={12}
          height={12}
          className="object-contain brightness-0 invert"
        />
      </div>

      <div className="flex-1 min-w-0 rounded-xl rounded-tl-sm border border-outline-variant/20 bg-surface-low overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-1.5 px-3 py-2 bg-primary/5 border-b border-outline-variant/15">
          <FileText size={13} className="text-primary shrink-0" />
          <span className="text-xs font-bold text-primary truncate">ร่าง{draft.docLabel}</span>
          <span className="ml-auto text-[10px] text-on-surface-variant">#{draft.draftId}</span>
        </div>

        <div className="px-3 py-2.5 space-y-2.5">
          {/* ข้อมูลที่กรอกให้แล้ว */}
          {draft.filledFields.length > 0 && (
            <div className="space-y-1">
              {draft.filledFields.map((f) => (
                <div key={f.key} className="flex items-start gap-1.5 text-[11px]">
                  <CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-on-surface-variant shrink-0">{f.label}:</span>
                  <span className="text-on-surface font-medium break-words">{f.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* คำเตือน (เช่น วันลาคงเหลือไม่พอ) */}
          {draft.warnings?.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5"
            >
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
              <span className="break-words">{w}</span>
            </div>
          ))}

          {/* ข้อมูลที่ยังขาด */}
          {hasMissing && (
            <div className="flex items-start gap-1.5 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
              <span className="break-words">
                ยังขาด: {draft.missingFields.map((m) => m.label).join(", ")}
              </span>
            </div>
          )}

          {/* ปุ่มเปิดฟอร์ม */}
          <button
            type="button"
            onClick={() => onOpen(draft)}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold text-on-primary bg-primary hover:brightness-110 active:scale-95 transition-all"
          >
            {hasMissing ? "กรอกข้อมูลที่ขาดต่อ" : "เปิดร่างเอกสารเพื่อตรวจสอบ"}
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
