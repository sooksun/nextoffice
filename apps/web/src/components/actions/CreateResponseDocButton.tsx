"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { FileText, Sparkles, X, Loader2 } from "lucide-react";

interface Props {
  caseId: number;
  caseTitle: string;
  directorNote?: string | null;
}

const DOC_TYPES = [
  { value: "internal_memo", label: "บันทึกข้อความ (หนังสือภายใน)" },
  { value: "external_letter", label: "หนังสือภายนอก (ตอบสนอง)" },
];

export default function CreateResponseDocButton({ caseId, caseTitle, directorNote }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [letterType, setLetterType] = useState("internal_memo");
  const [subject, setSubject] = useState(`รายงานผลการดำเนินการตาม ${caseTitle}`);
  const [recipientName, setRecipientName] = useState("ผู้อำนวยการโรงเรียน");
  const [bodyText, setBodyText] = useState(directorNote ? `ตามคำสั่ง: ${directorNote}\n\nผลการดำเนินการ:\n` : "");
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAiDraft = async () => {
    setAiLoading(true);
    try {
      const res = await apiFetch<any>("/outbound/ai-draft", {
        method: "POST",
        body: JSON.stringify({ caseId, draftType: letterType === "internal_memo" ? "memo" : "reply" }),
      });
      if (res.subject) setSubject(res.subject);
      if (res.bodyText) setBodyText(res.bodyText);
      if (res.recipientName) setRecipientName(res.recipientName);
    } catch (e: any) {
      toastError(e.message ?? "AI ร่างไม่สำเร็จ");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!subject.trim()) return toastError("กรุณาระบุเรื่อง");
    setSubmitting(true);
    try {
      const res = await apiFetch<{ id: number }>("/outbound/documents", {
        method: "POST",
        body: JSON.stringify({
          subject: subject.trim(),
          bodyText: bodyText.trim(),
          recipientName: recipientName.trim() || undefined,
          letterType,
          relatedInboundCaseId: caseId,
        }),
      });
      toastSuccess("สร้างเอกสารร่างแล้ว");
      setOpen(false);
      router.push(`/outbound/${res.id}`);
    } catch (e: any) {
      toastError(e.message ?? "สร้างไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold shadow-md transition-transform active:scale-95"
      >
        <FileText size={16} />
        สร้างเอกสารตอบสนอง
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !submitting && !aiLoading && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">สร้างเอกสารรายงาน / ตอบหนังสือ</h2>
              <button
                onClick={() => setOpen(false)}
                disabled={submitting || aiLoading}
                className="rounded-full p-1 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Document type */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">ประเภทเอกสาร</label>
                <div className="flex gap-2">
                  {DOC_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setLetterType(t.value)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        letterType === t.value
                          ? "border-violet-500 bg-violet-50 text-violet-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  {letterType === "internal_memo" ? "เรียน / ถึง" : "ผู้รับ / หน่วยงาน"}
                </label>
                <input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
                  placeholder="เช่น ผู้อำนวยการโรงเรียน"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">เรื่อง</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
                  placeholder="เรื่อง..."
                />
              </div>

              {/* Body */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-600">เนื้อหา</label>
                  <button
                    onClick={handleAiDraft}
                    disabled={aiLoading || submitting}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    AI ร่างให้
                  </button>
                </div>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
                  placeholder="รายงานผลการดำเนินการ..."
                />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={submitting || aiLoading}
                className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || aiLoading || !subject.trim()}
                className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2 justify-center">
                    <Loader2 size={14} className="animate-spin" /> กำลังสร้าง…
                  </span>
                ) : (
                  "สร้างเอกสารร่าง"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
