"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  X, Upload, FileText, CheckCircle, XCircle, Loader2,
  Building2, Calendar, Hash, AlertTriangle, Sparkles, UserPlus,
} from "lucide-react";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  official_letter: "หนังสือราชการ",
  possibly_official: "อาจเป็นหนังสือราชการ",
  non_official: "ไม่ใช่หนังสือราชการ",
  unknown: "ไม่สามารถระบุได้",
};

const URGENCY_LABEL: Record<string, string> = {
  high: "ด่วนที่สุด", medium: "ด่วน", low: "ปกติ",
  most_urgent: "ด่วนที่สุด", very_urgent: "ด่วนมาก", urgent: "ด่วน", normal: "ปกติ",
};
const URGENCY_COLOR: Record<string, string> = {
  high: "bg-red-100 text-red-800", most_urgent: "bg-red-100 text-red-800",
  medium: "bg-yellow-100 text-yellow-800", urgent: "bg-yellow-100 text-yellow-800", very_urgent: "bg-orange-100 text-orange-800",
  low: "bg-blue-100 text-blue-800", normal: "bg-blue-100 text-blue-800",
};

interface UploadResult {
  documentIntakeId: number;
  isOfficialDocument: boolean;
  classificationLabel: string;
  confidence: number;
  documentSubtype: string | null;
  reasoningSummary: string | null;
  metadata: {
    issuingAuthority: string;
    documentNo: string;
    documentDate: string;
    subjectText: string;
    deadlineDate: string;
    summary: string;
    intent: string;
    urgency: string;
    actions: string[];
    isMeeting: boolean;
    meetingDate: string;
    meetingTime: string;
    meetingLocation: string;
  } | null;
  extractedTextPreview: string;
}

interface RoutingSuggestion {
  workGroupCode: string;
  workGroupName: string;
  confidence: number;
  suggestedUsers: {
    userId: number;
    fullName: string;
    workFunctionName: string;
    role: string;
  }[];
}

interface RoutingResponse {
  found: boolean;
  suggestion: RoutingSuggestion | null;
  reason?: string;
}

type Step = "upload" | "processing" | "result" | "not_official";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function DocumentUploadModal({ isOpen, onClose }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [routing, setRouting] = useState<RoutingSuggestion | null>(null);
  const [loadingRouting, setLoadingRouting] = useState(false);
  const [savingCase, setSavingCase] = useState(false);

  if (!isOpen) return null;

  const ACCEPT = ".pdf,.docx,.jpg,.jpeg,.png";
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  const reset = () => {
    setStep("upload");
    setFile(null);
    setResult(null);
    setRouting(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_SIZE) {
      alert("ไฟล์ใหญ่เกิน 10MB");
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileChange(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStep("processing");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
      const res = await fetch(`${apiBase}/intake/web-upload`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
      });
      if (!res.ok) {
        let errMsg = "เกิดข้อผิดพลาด";
        try {
          const errData = await res.json();
          errMsg = errData.message || errMsg;
        } catch {
          errMsg = await res.text();
        }
        throw new Error(errMsg);
      }
      const data: UploadResult = await res.json();
      setResult(data);

      if (data.isOfficialDocument) {
        setStep("result");
      } else {
        setStep("not_official");
      }
    } catch (err: any) {
      alert(err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่");
      setStep("upload");
    }
  };

  const handleGetRouting = async () => {
    if (!result?.documentIntakeId) return;
    setLoadingRouting(true);
    try {
      const caseRes = await apiFetch<{ caseId: number; status: string }>(`/cases/from-intake/${result.documentIntakeId}`, { method: "POST" });
      const routeRes = await apiFetch<RoutingResponse>(`/cases/${caseRes.caseId}/routing-suggestion`);
      if (routeRes?.found && routeRes.suggestion) {
        setRouting(routeRes.suggestion);
      } else {
        setRouting(null);
        alert("ไม่พบกลุ่มงานที่ตรงกับหัวเรื่องเอกสาร กรุณามอบหมายงานด้วยตนเอง");
      }
    } catch (err: any) {
      setRouting(null);
      alert(err.message || "เกิดข้อผิดพลาดในการขอคำแนะนำ");
    } finally {
      setLoadingRouting(false);
    }
  };

  const handleSaveAndGo = async () => {
    if (!result?.documentIntakeId) return;
    setSavingCase(true);
    try {
      // Create case if not already created
      const caseRes = await apiFetch<{ caseId: number }>(`/cases/from-intake/${result.documentIntakeId}`, { method: "POST" });
      handleClose();
      router.push(`/inbox/${caseRes.caseId}`);
    } catch {
      // Case might already exist, try to find it
      handleClose();
      router.push("/inbox");
    } finally {
      setSavingCase(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="bg-surface-lowest rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText size={18} className="text-primary" />
            </div>
            <h2 className="text-lg font-bold text-on-surface">
              {step === "upload" && "อัปโหลดเอกสารใหม่"}
              {step === "processing" && "กำลังวิเคราะห์เอกสาร..."}
              {step === "result" && "ผลการวิเคราะห์เอกสาร"}
              {step === "not_official" && "ไม่ใช่หนังสือราชการ"}
            </h2>
          </div>
          <button onClick={handleClose} className="p-1.5 hover:bg-surface-bright rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* STEP 1: Upload */}
          {step === "upload" && (
            <div className="space-y-5">
              <div
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer ${
                  dragOver ? "border-primary bg-primary/5" : file ? "border-green-400 bg-green-50" : "border-outline-variant/30 hover:border-primary/50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                />
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <CheckCircle size={40} className="text-green-500" />
                    <p className="font-semibold text-on-surface">{file.name}</p>
                    <p className="text-xs text-on-surface-variant">
                      {(file.size / 1024).toFixed(0)} KB | คลิกเพื่อเปลี่ยนไฟล์
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload size={40} className="text-on-surface-variant" />
                    <p className="font-semibold text-on-surface">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</p>
                    <p className="text-xs text-on-surface-variant">
                      รองรับ PDF, DOCX, JPG, JPEG, PNG (ไม่เกิน 10MB, 1 ไฟล์)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Processing */}
          {step === "processing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 size={48} className="text-primary animate-spin" />
              <p className="font-semibold text-on-surface">AI กำลังวิเคราะห์เอกสาร</p>
              <p className="text-sm text-on-surface-variant text-center">
                อ่านข้อมูล &rarr; ตรวจสอบประเภทหนังสือราชการ &rarr; สกัดข้อมูลสำคัญ
              </p>
              <div className="flex gap-1 mt-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          {/* STEP 3: Not Official */}
          {step === "not_official" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle size={32} className="text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-red-700">ไม่ใช่หนังสือราชการ</h3>
              <p className="text-sm text-on-surface-variant text-center max-w-md">
                AI ตรวจสอบแล้วพบว่าเอกสารนี้ไม่ใช่หนังสือราชการ 6 ประเภท
                ตามระเบียบสำนักนายกรัฐมนตรี ไม่สามารถบันทึกในระบบสารบรรณได้
              </p>
              {result?.reasoningSummary && (
                <p className="text-xs text-on-surface-variant bg-surface-bright p-3 rounded-xl max-w-md text-center">
                  {result.reasoningSummary}
                </p>
              )}
            </div>
          )}

          {/* STEP 4: Result (Official Document) */}
          {step === "result" && result?.metadata && (
            <div className="space-y-5">
              {/* Classification badge */}
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl border border-green-200">
                <CheckCircle size={24} className="text-green-600 shrink-0" />
                <div>
                  <p className="font-bold text-green-800">
                    หนังสือราชการ
                    {result.documentSubtype && ` (${result.documentSubtype})`}
                  </p>
                  <p className="text-xs text-green-700">
                    ความมั่นใจ {(result.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                {result.metadata.urgency && (
                  <span className={`ml-auto inline-flex px-3 py-1 rounded-lg text-xs font-bold ${URGENCY_COLOR[result.metadata.urgency] || URGENCY_COLOR.normal}`}>
                    {URGENCY_LABEL[result.metadata.urgency] || result.metadata.urgency}
                  </span>
                )}
              </div>

              {/* Document Metadata Grid */}
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4">
                <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">ข้อมูลหนังสือ</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Hash size={14} className="text-on-surface-variant mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-on-surface-variant">เลขที่หนังสือ</p>
                      <p className="font-medium">{result.metadata.documentNo || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar size={14} className="text-on-surface-variant mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-on-surface-variant">ลงวันที่</p>
                      <p className="font-medium">{result.metadata.documentDate || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 col-span-2">
                    <Building2 size={14} className="text-on-surface-variant mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-on-surface-variant">หน่วยงานที่ออกหนังสือ</p>
                      <p className="font-medium">{result.metadata.issuingAuthority || "—"}</p>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-on-surface-variant mb-1">ชื่อเรื่อง</p>
                    <p className="font-semibold text-on-surface">{result.metadata.subjectText || "—"}</p>
                  </div>
                  {result.metadata.deadlineDate && (
                    <div className="col-span-2 flex items-center gap-2 p-2 bg-yellow-50 rounded-xl">
                      <AlertTriangle size={14} className="text-yellow-600 shrink-0" />
                      <p className="text-sm text-yellow-800 font-medium">
                        กำหนดเสร็จ: {result.metadata.deadlineDate}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Summary */}
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4">
                <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-2">สรุปโดย AI</h3>
                <p className="text-sm text-on-surface leading-relaxed">{result.metadata.summary}</p>
                {result.metadata.intent && (
                  <p className="text-xs text-on-surface-variant mt-2">
                    <span className="font-semibold">วัตถุประสงค์:</span> {result.metadata.intent}
                  </p>
                )}
              </div>

              {/* Actions from document */}
              {result.metadata.actions?.length > 0 && (
                <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4">
                  <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-2">สิ่งที่ต้องดำเนินการ</h3>
                  <ul className="space-y-1.5">
                    {result.metadata.actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Meeting info */}
              {result.metadata.isMeeting && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <h3 className="text-sm font-bold text-blue-800 mb-2">การประชุม/นัดหมาย</h3>
                  <div className="text-sm text-blue-700 space-y-1">
                    {result.metadata.meetingDate && <p>วันที่: {result.metadata.meetingDate}</p>}
                    {result.metadata.meetingTime && <p>เวลา: {result.metadata.meetingTime}</p>}
                    {result.metadata.meetingLocation && <p>สถานที่: {result.metadata.meetingLocation}</p>}
                  </div>
                </div>
              )}

              {/* AI Routing Recommendation */}
              <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-purple-800 flex items-center gap-2">
                    <Sparkles size={16} />
                    คำแนะนำจาก AI
                  </h3>
                  {!routing && (
                    <button
                      onClick={handleGetRouting}
                      disabled={loadingRouting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold transition-transform active:scale-95 disabled:opacity-50"
                    >
                      {loadingRouting ? (
                        <><Loader2 size={12} className="animate-spin" /> กำลังวิเคราะห์...</>
                      ) : (
                        <><Sparkles size={12} /> ขอคำแนะนำมอบหมายงาน</>
                      )}
                    </button>
                  )}
                </div>
                {routing ? (
                  <div className="space-y-3">
                    <p className="text-sm text-purple-700">
                      <span className="font-semibold">กลุ่มงานที่แนะนำ:</span> {routing.workGroupName}
                      <span className="text-xs ml-1">(ความมั่นใจ {(routing.confidence * 100).toFixed(0)}%)</span>
                    </p>
                    {routing.suggestedUsers?.length > 0 && (
                      <div>
                        <p className="text-xs text-purple-600 font-semibold mb-1.5">ครูที่แนะนำให้รับผิดชอบ:</p>
                        <div className="space-y-1.5">
                          {routing.suggestedUsers.map((u) => (
                            <div key={u.userId} className="flex items-center gap-2 p-2 bg-white/60 rounded-lg">
                              <UserPlus size={14} className="text-purple-500 shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-purple-900">{u.fullName}</p>
                                <p className="text-xs text-purple-600">{u.workFunctionName} ({u.role})</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : !loadingRouting && (
                  <p className="text-xs text-purple-600">
                    คลิก "ขอคำแนะนำมอบหมายงาน" เพื่อให้ AI ช่วยแนะนำกลุ่มงานและครูที่เหมาะสม
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-outline-variant/20 flex gap-3 justify-end">
          {step === "upload" && (
            <>
              <button onClick={handleClose} className="btn-ghost">ยกเลิก</button>
              <button
                onClick={handleUpload}
                disabled={!file}
                className="btn-primary disabled:opacity-50 flex items-center gap-2"
              >
                <Upload size={16} />
                อัปโหลดและวิเคราะห์
              </button>
            </>
          )}
          {step === "not_official" && (
            <button onClick={handleClose} className="btn-primary">ปิด</button>
          )}
          {step === "result" && (
            <>
              <button onClick={reset} className="btn-ghost">อัปโหลดใหม่</button>
              <button
                onClick={handleSaveAndGo}
                disabled={savingCase}
                className="btn-primary flex items-center gap-2"
              >
                <CheckCircle size={16} />
                {savingCase ? "กำลังบันทึก..." : "บันทึกและดูรายละเอียด"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
