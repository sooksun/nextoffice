"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import SignaturePad from "@/components/SignaturePad";
import { useLiff } from "../../LiffBoot";

interface CaseDetail {
  id: number;
  title: string;
  registrationNo: string | null;
  urgencyLevel: string;
  directorNote: string | null;
  description: string | null;
  status: string;
  intake?: { id: number };
}

export default function LiffSignPage() {
  const { status: liffStatus } = useLiff();
  const params = useParams();
  const router = useRouter();
  const caseId = params.id as string;

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [noteText, setNoteText] = useState("");
  const [signatureMethod, setSignatureMethod] = useState<"pad" | "electronic">("electronic");
  const [padSignature, setPadSignature] = useState("");
  const [hasElectronicSig, setHasElectronicSig] = useState(false);

  useEffect(() => {
    if (liffStatus !== "ready") return;
    apiFetch<CaseDetail>(`/cases/${caseId}`)
      .then((data) => {
        setCaseData(data);
        setNoteText(data.directorNote ?? "ทราบ / ดำเนินการตามเสนอ");
      })
      .catch(() => toast.error("ไม่พบข้อมูล"))
      .finally(() => setLoading(false));

    apiFetch<any[]>("/staff-config")
      .then((list) => {
        const arr = Array.isArray(list) ? list : (list as any).data ?? [];
        const me = arr.find((s: any) => s.roleCode === "DIRECTOR" || s.roleCode === "VICE_DIRECTOR");
        if (me?.hasSignature) setHasElectronicSig(true);
      })
      .catch(() => {});
  }, [caseId, liffStatus]);

  const intakeId = caseData?.intake?.id ?? caseData?.description?.match(/intake:(\d+)/)?.[1];
  const pdfUrl = intakeId ? `/api/files/intake/${intakeId}?stamped=true` : null;

  const handleSubmit = async () => {
    if (!noteText.trim()) return toast.error("กรุณาระบุคำสั่ง");
    if (signatureMethod === "pad" && !padSignature) return toast.error("กรุณาลงนามก่อน");
    if (signatureMethod === "electronic" && !hasElectronicSig)
      return toast.error("ไม่พบลายเซ็นอิเล็กทรอนิกส์ในระบบ");

    setSubmitting(true);
    try {
      await apiFetch(`/cases/${caseId}/director-sign`, {
        method: "POST",
        body: JSON.stringify({
          noteText,
          signatureMethod,
          signatureBase64: signatureMethod === "pad" ? padSignature : undefined,
        }),
      });
      toast.success("ลงนามสำเร็จ");
      router.push("/liff");
    } catch (e: any) {
      toast.error(e.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-sm text-slate-500">กำลังโหลด…</div>;
  if (!caseData) return <div className="p-6 text-center text-sm text-slate-500">ไม่พบข้อมูล</div>;

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href={`/liff/cases/${caseId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <h1 className="mb-1 text-lg font-semibold">ลงนามเกษียณหนังสือ</h1>
      <p className="mb-4 line-clamp-2 text-xs text-slate-500">{caseData.title}</p>

      {pdfUrl && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 text-center">
          <p className="mb-1 text-xs text-slate-500">ไฟล์เอกสารแนบ</p>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white active:scale-[0.98]"
          >
            เปิดดูเอกสาร PDF
          </a>
        </div>
      )}

      <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-semibold">คำสั่ง / เกษียณหนังสือ</label>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={4}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          placeholder="เช่น ทราบ / ดำเนินการตามเสนอ"
        />
      </div>

      <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <label className="mb-3 block text-sm font-semibold">วิธีลงนาม</label>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setSignatureMethod("electronic")}
            className={`rounded-lg border py-2 text-sm ${
              signatureMethod === "electronic"
                ? "border-green-500 bg-green-50 text-green-700"
                : "border-slate-200 text-slate-600"
            }`}
          >
            ลายเซ็นในระบบ
          </button>
          <button
            onClick={() => setSignatureMethod("pad")}
            className={`rounded-lg border py-2 text-sm ${
              signatureMethod === "pad"
                ? "border-green-500 bg-green-50 text-green-700"
                : "border-slate-200 text-slate-600"
            }`}
          >
            เซ็นสด
          </button>
        </div>

        {signatureMethod === "electronic" ? (
          <p className="text-xs text-slate-500">
            {hasElectronicSig
              ? "✓ พบลายเซ็นในระบบ พร้อมใช้งาน"
              : "⚠ ยังไม่มีลายเซ็นในระบบ กรุณาอัปโหลดผ่านเมนูตั้งค่าบุคลากร"}
          </p>
        ) : (
          <SignaturePad onSignature={setPadSignature} width={340} height={140} />
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-lg bg-green-600 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
      >
        {submitting ? "กำลังลงนาม…" : "ยืนยันลงนาม"}
      </button>
    </div>
  );
}
