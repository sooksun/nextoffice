"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastError, toastWarning } from "@/lib/toast";
import Link from "next/link";
import {
  ArrowLeft, FilePlus, FileText, Paperclip, CheckCircle, Loader2, Upload,
} from "lucide-react";
import ThaiDatePicker from "@/components/ui/ThaiDatePicker";

interface IntakeData {
  id: number;
  originalFileName: string | null;
  mimeType: string | null;
  uploadStatus: string;
  storagePath: string | null;
  aiResult: {
    isOfficialDocument: boolean;
    documentNo: string | null;
    documentDate: string | null;
    subjectText: string | null;
    summaryText: string | null;
    issuingAuthority: string | null;
    recipientText: string | null;
    deadlineDate: string | null;
    nextActionJson: string | null;
  } | null;
}

const URGENCY_OPTIONS = [
  { value: "normal", label: "ทั่วไป" },
  { value: "urgent", label: "ด่วน" },
  { value: "very_urgent", label: "ด่วนที่สุด" },
  { value: "most_urgent", label: "ด่วนที่สุด" },
];

/** Parse date string to CE YYYY-MM-DD.
 *  If the year part > 2500 it is assumed to be Buddhist Era and is converted to CE (−543). */
function toInputDate(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      const year = parseInt(iso[1], 10);
      const ceYear = year > 2500 ? year - 543 : year;
      const d = new Date(`${ceYear}-${iso[2]}-${iso[3]}T00:00:00`);
      return isNaN(d.getTime()) ? "" : `${ceYear}-${iso[2]}-${iso[3]}`;
    }
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

/** Return CE YYYY-MM-DD for today + n days */
function defaultDueDate(daysFromNow = 3): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

function NewInboxForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intakeId = searchParams.get("intakeId");

  const [loading, setLoading] = useState(false);
  const [loadingIntake, setLoadingIntake] = useState(!!intakeId);
  const [intake, setIntake] = useState<IntakeData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedIntakeId, setUploadedIntakeId] = useState<number | null>(intakeId ? Number(intakeId) : null);
  const [form, setForm] = useState({
    title: "",
    documentNo: "",
    documentDate: "",
    senderOrg: "",
    recipientNote: "",
    urgencyLevel: "normal",
    dueDate: "",
    description: "",
  });

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const loadIntake = useCallback(async (id: string) => {
    setLoadingIntake(true);
    try {
      const data = await apiFetch<IntakeData>(`/intake/${id}`);
      setIntake(data);
      if (data.aiResult) {
        const r = data.aiResult;
        setForm({
          title: r.subjectText || "",
          documentNo: r.documentNo || "",
          documentDate: toInputDate(r.documentDate),
          senderOrg: r.issuingAuthority || "",
          recipientNote: r.recipientText || "ผู้อำนวยการโรงเรียน",
          urgencyLevel: "normal",
          dueDate: toInputDate(r.deadlineDate) || defaultDueDate(3),
          description: r.summaryText || "",
        });
      }
    } catch {
      // Intake load failed — user fills manually
    } finally {
      setLoadingIntake(false);
    }
  }, []);

  useEffect(() => {
    if (intakeId) loadIntake(intakeId);
  }, [intakeId, loadIntake]);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBase}/intake/web-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setUploadedIntakeId(data.id);
      await loadIntake(String(data.id));
    } catch {
      toastError("อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toastWarning("กรุณากรอกชื่อเรื่อง"); return; }
    setLoading(true);
    try {
      const res = await apiFetch<{ caseId: number }>("/cases/manual", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          documentNo: form.documentNo || undefined,
          documentDate: form.documentDate || undefined,
          senderOrg: form.senderOrg || undefined,
          recipientNote: form.recipientNote || undefined,
          urgencyLevel: form.urgencyLevel,
          dueDate: form.dueDate || undefined,
          description: form.description || undefined,
          intakeId: uploadedIntakeId || (intakeId ? Number(intakeId) : undefined),
        }),
      });
      router.push(`/inbox/${res.caseId}`);
    } catch (err: unknown) {
      toastError((err as Error).message || "สร้างเอกสารไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  if (loadingIntake) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-on-surface-variant">
        <Loader2 size={24} className="animate-spin text-primary" />
        กำลังโหลดข้อมูลจาก AI...
      </div>
    );
  }

  const hasFile = intake && intake.storagePath && intake.uploadStatus !== "storage_failed";
  const fileUrl = hasFile ? `${apiBase}/intake/${intake.id}/file` : null;

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/inbox" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> ย้อนกลับ
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <FilePlus size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">ลงทะเบียนรับเอกสาร</h1>
          <p className="text-xs text-on-surface-variant">
            {intakeId ? "ข้อมูลโหลดจาก AI อัตโนมัติ — ตรวจสอบและแก้ไขก่อนบันทึก" : "กรอกข้อมูลเอกสาร"}
          </p>
        </div>
      </div>

      {/* Original file attachment banner */}
      {intake && (
        <div className={`flex items-center gap-3 p-4 rounded-2xl border mb-5 ${
          hasFile
            ? "bg-blue-50 border-blue-200"
            : "bg-gray-50 border-gray-200"
        }`}>
          <div className="w-9 h-9 rounded-xl bg-white/80 border border-gray-200 flex items-center justify-center shrink-0">
            <FileText size={18} className={hasFile ? "text-blue-600" : "text-gray-400"} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-on-surface truncate">
              {intake.originalFileName || `เอกสาร #${intake.id}`}
            </p>
            <p className="text-xs text-on-surface-variant">{intake.mimeType || "—"}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold flex items-center gap-1">
              <CheckCircle size={10} /> เอกสารแนบต้นฉบับ
            </span>
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors"
              >
                <Paperclip size={12} />
                เปิดไฟล์
              </a>
            )}
          </div>
        </div>
      )}

      {/* File upload area — show when no file attached yet */}
      {!intake && (
        <label className={`flex flex-col items-center gap-2 p-6 rounded-2xl border-2 border-dashed cursor-pointer mb-5 transition-colors ${
          uploading ? "border-primary/50 bg-primary/5" : "border-gray-300 hover:border-primary/40 hover:bg-primary/5"
        }`}>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.docx"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileUpload(f);
            }}
          />
          {uploading ? (
            <>
              <Loader2 size={28} className="animate-spin text-primary" />
              <span className="text-sm text-primary font-semibold">กำลังอัปโหลดและวิเคราะห์ด้วย AI...</span>
            </>
          ) : (
            <>
              <Upload size={28} className="text-gray-400" />
              <span className="text-sm text-gray-600 font-semibold">แนบไฟล์หนังสือเข้า</span>
              <span className="text-xs text-gray-400">PDF, รูปภาพ หรือ Word (ไม่เกิน 10MB) — AI จะสกัดข้อมูลอัตโนมัติ</span>
            </>
          )}
        </label>
      )}

      <form onSubmit={handleSubmit} className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm p-6 space-y-5">

        {/* ชั้นความเร็ว + เลขที่หนังสือ + วันที่หนังสือ */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label-sm">ชั้นความเร็ว <span className="text-red-500">*</span></label>
            <select
              value={form.urgencyLevel}
              onChange={(e) => update("urgencyLevel", e.target.value)}
              className="input-select w-full"
            >
              {URGENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-sm">เลขที่หนังสือ</label>
            <input
              type="text"
              value={form.documentNo}
              onChange={(e) => update("documentNo", e.target.value)}
              placeholder="เช่น ที่ ศธ 04045/ว11081"
              className="input-text w-full"
            />
          </div>
          <div>
            <label className="label-sm">หนังสือลงวันที่</label>
            <ThaiDatePicker value={form.documentDate} onChange={(v) => update("documentDate", v)} />
          </div>
        </div>

        {/* จาก / ถึง */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-sm">จาก (หน่วยงานที่ส่ง)</label>
            <input
              type="text"
              value={form.senderOrg}
              onChange={(e) => update("senderOrg", e.target.value)}
              placeholder="ชื่อหน่วยงานผู้ส่ง"
              className="input-text w-full"
            />
          </div>
          <div>
            <label className="label-sm">ถึง (ผู้รับ)</label>
            <input
              type="text"
              value={form.recipientNote}
              onChange={(e) => update("recipientNote", e.target.value)}
              placeholder="เช่น ผู้อำนวยการโรงเรียน"
              className="input-text w-full"
            />
          </div>
        </div>

        {/* ชื่อเรื่อง */}
        <div>
          <label className="label-sm">
            เรื่อง (ชื่อเรื่อง) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="ชื่อเรื่อง"
            className="input-text w-full"
            required
          />
        </div>

        {/* กำหนดเสร็จ */}
        <div>
          <label className="label-sm">กำหนดเสร็จ / วันครบกำหนด</label>
          <ThaiDatePicker value={form.dueDate} onChange={(v) => update("dueDate", v)} />
        </div>

        {/* หมายเหตุ / สรุป */}
        <div>
          <label className="label-sm">หมายเหตุ / สรุปเนื้อหา</label>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="หมายเหตุหรือสรุปเนื้อหา"
            className="w-full p-3 rounded-xl border border-outline-variant/20 bg-surface-bright text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            rows={4}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-primary text-on-primary rounded-2xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95 disabled:opacity-50"
        >
          {loading ? (
            <><Loader2 size={16} className="animate-spin" /> กำลังบันทึก...</>
          ) : (
            <><CheckCircle size={16} /> ลงทะเบียนรับเอกสาร</>
          )}
        </button>
      </form>
    </div>
  );
}

export default function NewInboxPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 gap-3 text-on-surface-variant">
        <Loader2 size={24} className="animate-spin text-primary" />
        กำลังโหลด...
      </div>
    }>
      <NewInboxForm />
    </Suspense>
  );
}
