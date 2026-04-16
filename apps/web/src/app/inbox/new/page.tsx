"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastError, toastSuccess, toastWarning } from "@/lib/toast";
import Link from "next/link";
import {
  ArrowLeft, FilePlus, FileText, CheckCircle, Loader2, Upload, X,
} from "lucide-react";
import ThaiDatePicker from "@/components/ui/ThaiDatePicker";

const URGENCY_OPTIONS = [
  { value: "normal",      label: "ทั่วไป" },
  { value: "urgent",      label: "ด่วน" },
  { value: "very_urgent", label: "ด่วนที่สุด" },
  { value: "most_urgent", label: "ด่วนที่สุด" },
];

interface AttachedFile {
  intakeId: number;
  fileName: string;
  mimeType: string;
}

function NewInboxForm() {
  const router = useRouter();

  const [loading, setLoading]         = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [attached, setAttached]       = useState<AttachedFile | null>(null);

  const [form, setForm] = useState({
    title:         "",
    documentNo:    "",
    documentDate:  "",
    senderOrg:     "",
    recipientNote: "ผู้อำนวยการโรงเรียน",
    urgencyLevel:  "normal",
    dueDate:       "",
    description:   "",
  });

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  /* ── อัปโหลดไฟล์แนบ (ไม่เติมฟอร์ม) ── */
  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBase}/intake/store-only`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setAttached({ intakeId: data.id, fileName: file.name, mimeType: file.type });
      toastSuccess("แนบไฟล์สำเร็จ");
    } catch {
      toastError("อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  /* ── บันทึก ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toastWarning("กรุณากรอกชื่อเรื่อง"); return; }
    setLoading(true);
    try {
      const res = await apiFetch<{ caseId: number }>("/cases/manual", {
        method: "POST",
        body: JSON.stringify({
          title:         form.title,
          documentNo:    form.documentNo    || undefined,
          documentDate:  form.documentDate  || undefined,
          senderOrg:     form.senderOrg     || undefined,
          recipientNote: form.recipientNote || undefined,
          urgencyLevel:  form.urgencyLevel,
          dueDate:       form.dueDate       || undefined,
          description:   form.description   || undefined,
          intakeId:      attached?.intakeId  ?? undefined,
        }),
      });
      router.push(`/inbox/${res.caseId}`);
    } catch (err: unknown) {
      toastError((err as Error).message || "สร้างเอกสารไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/inbox" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> ย้อนกลับ
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <FilePlus size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">ลงทะเบียนรับเอกสาร</h1>
          <p className="text-xs text-on-surface-variant">กรอกข้อมูลเอกสารที่ได้รับ</p>
        </div>
      </div>

      {/* ── File attachment area ── */}
      {!attached ? (
        <label className={`flex flex-col items-center gap-2 p-6 rounded-2xl border-2 border-dashed cursor-pointer mb-5 transition-colors ${
          uploading
            ? "border-primary/50 bg-primary/5 pointer-events-none"
            : "border-outline-variant/40 hover:border-primary/40 hover:bg-primary/5"
        }`}>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.docx"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
          />
          {uploading ? (
            <>
              <Loader2 size={28} className="animate-spin text-primary" />
              <span className="text-sm text-primary font-semibold">กำลังอัปโหลด...</span>
            </>
          ) : (
            <>
              <Upload size={28} className="text-outline/60" />
              <span className="text-sm text-on-surface-variant font-semibold">แนบสำเนาหนังสือ (ไม่บังคับ)</span>
              <span className="text-xs text-outline/60">PDF, รูปภาพ หรือ Word — เพื่อแนบต้นฉบับไว้ในระบบ</span>
            </>
          )}
        </label>
      ) : (
        /* ── แสดงไฟล์ที่แนบแล้ว ── */
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-primary/20 bg-primary/5 mb-5">
          <div className="w-9 h-9 rounded-xl bg-white border border-outline-variant/20 flex items-center justify-center shrink-0">
            <FileText size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-on-surface truncate">{attached.fileName}</p>
            <p className="text-xs text-on-surface-variant">{attached.mimeType}</p>
          </div>
          <button
            type="button"
            onClick={() => setAttached(null)}
            className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error-container/40 transition-colors"
            title="ยกเลิกไฟล์แนบ"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── Form ── */}
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

        {/* เรื่อง */}
        <div>
          <label className="label-sm">เรื่อง (ชื่อเรื่อง) <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="ระบุชื่อเรื่องของหนังสือ"
            className="input-text w-full"
            required
          />
        </div>

        {/* กำหนดเสร็จ */}
        <div>
          <label className="label-sm">กำหนดเสร็จ / วันครบกำหนด</label>
          <ThaiDatePicker value={form.dueDate} onChange={(v) => update("dueDate", v)} />
        </div>

        {/* หมายเหตุ */}
        <div>
          <label className="label-sm">หมายเหตุ / สรุปเนื้อหา</label>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="หมายเหตุหรือสรุปเนื้อหาโดยย่อ"
            className="w-full p-3 rounded-xl border border-outline-variant/20 bg-surface-bright text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            rows={4}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 text-white"
          style={{
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            boxShadow: "0 4px 16px rgba(124,58,237,0.35)",
          }}
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
