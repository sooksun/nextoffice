"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { ArrowLeft, PenLine, Stamp, Loader2 } from "lucide-react";
import Link from "next/link";
import SignaturePad from "@/components/SignaturePad";

interface CaseDetail {
  id: number;
  title: string;
  registrationNo: string | null;
  urgencyLevel: string;
  directorNote: string | null;
  description: string | null;
  status: string;
  directorStampStatus: string | null;
}

export default function DirectorSigningDetailPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params.id as string;

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [noteText, setNoteText] = useState("");
  const [signatureMethod, setSignatureMethod] = useState<"pad" | "electronic">("electronic");
  const [padSignature, setPadSignature] = useState("");
  const [hasElectronicSig, setHasElectronicSig] = useState(false);
  const [sigPreviewUrl, setSigPreviewUrl] = useState<string | null>(null);

  // Parse intakeId from description
  const intakeId = caseData?.description?.match(/intake:(\d+)/)?.[1];
  const pdfUrl = intakeId ? `/api/files/intake/${intakeId}?stamped=true` : null;

  useEffect(() => {
    apiFetch<CaseDetail>(`/cases/${caseId}`)
      .then((data) => {
        setCaseData(data);
        setNoteText(data.directorNote ?? "");
      })
      .catch(() => toast.error("ไม่พบข้อมูล"))
      .finally(() => setLoading(false));
  }, [caseId]);

  // Check if electronic signature exists
  useEffect(() => {
    apiFetch<{ id: number; hasSignature: boolean; roleCode: string }[]>("/staff-config")
      .then((list) => {
        const arr = Array.isArray(list) ? list : (list as any).data ?? [];
        const me = arr.find(
          (s: any) => s.roleCode === "DIRECTOR" || s.roleCode === "VICE_DIRECTOR",
        );
        if (me?.hasSignature) {
          setHasElectronicSig(true);
          setSigPreviewUrl(`/api/staff-config/${me.id}/signature`);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!noteText.trim()) {
      toast.error("กรุณาระบุคำสั่ง / เกษียณหนังสือ");
      return;
    }
    if (signatureMethod === "pad" && !padSignature) {
      toast.error("กรุณาลงนามก่อน");
      return;
    }
    if (signatureMethod === "electronic" && !hasElectronicSig) {
      toast.error("ไม่พบลายเซ็นอิเล็กทรอนิกส์ กรุณาอัปโหลดที่ตั้งค่าบุคลากร");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch(`/cases/${caseId}/director-sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteText,
          signatureMethod,
          signatureBase64: signatureMethod === "pad" ? padSignature : undefined,
        }),
      });
      toast.success("ลงนามเกษียณหนังสือสำเร็จ");
      router.push("/director/signing");
      router.refresh();
    } catch (e: any) {
      toast.error(e.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  }, [caseId, noteText, signatureMethod, padSignature, hasElectronicSig, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!caseData) {
    return <p className="text-center py-20 text-on-surface-variant">ไม่พบข้อมูล</p>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/director/signing"
          className="w-9 h-9 rounded-xl bg-surface-bright flex items-center justify-center hover:bg-primary/10 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-primary tracking-tight truncate">
            ลงนามเกษียณหนังสือ
          </h1>
          <p className="text-xs text-on-surface-variant truncate">{caseData.title}</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: PDF Preview */}
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm overflow-hidden">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full border-0"
              style={{ height: "700px" }}
              title="เอกสารต้นฉบับ"
            />
          ) : (
            <div className="flex items-center justify-center h-96 text-on-surface-variant">
              ไม่พบไฟล์เอกสาร
            </div>
          )}
        </div>

        {/* Right: Signing Panel */}
        <div className="space-y-5">
          {/* Director Note Editor */}
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm p-5">
            <label className="block text-sm font-bold text-on-surface mb-2">
              <Stamp size={14} className="inline mr-1.5" />
              คำสั่ง / เกษียณหนังสือ
            </label>
            <p className="text-xs text-on-surface-variant mb-3">
              แก้ไขข้อความที่จะแสดงใน Stamp 3 (คำสั่ง ผอ.) ได้ตามต้องการ
            </p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-outline-variant/30 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
              placeholder="ระบุคำสั่ง / เกษียณหนังสือ..."
            />
            <p className="text-xs text-outline mt-1 text-right">
              {noteText.length} ตัวอักษร
            </p>
          </div>

          {/* Signature Method Selector */}
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm p-5">
            <label className="block text-sm font-bold text-on-surface mb-3">
              <PenLine size={14} className="inline mr-1.5" />
              วิธีลงนาม
            </label>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                type="button"
                onClick={() => setSignatureMethod("pad")}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  signatureMethod === "pad"
                    ? "border-primary bg-primary/5"
                    : "border-outline-variant/20 hover:border-primary/30"
                }`}
              >
                <p className="text-sm font-bold">ลงนามด้วยลายมือ</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  เซ็นด้วยปากกา / สไตลัส
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSignatureMethod("electronic")}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  signatureMethod === "electronic"
                    ? "border-primary bg-primary/5"
                    : "border-outline-variant/20 hover:border-primary/30"
                }`}
              >
                <p className="text-sm font-bold">ลายเซ็นอิเล็กทรอนิกส์</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  ใช้ภาพลายเซ็นที่อัปโหลดไว้
                </p>
              </button>
            </div>

            {/* Signature Pad */}
            {signatureMethod === "pad" && (
              <SignaturePad onSignature={setPadSignature} width={380} height={150} />
            )}

            {/* Electronic Signature Preview */}
            {signatureMethod === "electronic" && (
              <div>
                {hasElectronicSig && sigPreviewUrl ? (
                  <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-outline-variant/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sigPreviewUrl}
                      alt="ลายเซ็นอิเล็กทรอนิกส์"
                      className="max-h-24 object-contain"
                    />
                    <p className="text-xs text-on-surface-variant">ลายเซ็นที่จะใช้ประทับ</p>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200 text-center">
                    <p className="text-sm text-yellow-800 font-semibold">ยังไม่มีลายเซ็นอิเล็กทรอนิกส์</p>
                    <Link
                      href="/settings/staff"
                      className="text-xs text-primary hover:underline mt-1 inline-block"
                    >
                      อัปโหลดลายเซ็นที่ตั้งค่าบุคลากร
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3.5 bg-primary text-on-primary rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                กำลังประทับตรา...
              </>
            ) : (
              <>
                <Stamp size={16} />
                ลงนามเกษียณหนังสือ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
