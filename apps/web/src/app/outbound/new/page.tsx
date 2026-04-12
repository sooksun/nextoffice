"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastError, toastWarning } from "@/lib/toast";
import Link from "next/link";
import { ArrowLeft, SendHorizontal, Upload, Loader2, FileText, Paperclip, CheckCircle } from "lucide-react";
import { getUser } from "@/lib/auth";

const LETTER_TYPE_LABEL: Record<string, string> = {
  external_letter: "หนังสือภายนอก",
  internal_memo:   "หนังสือภายใน (บันทึกข้อความ)",
  directive:       "หนังสือสั่งการ (คำสั่ง/ระเบียบ)",
  pr_letter:       "หนังสือประชาสัมพันธ์",
  official_record: "หนังสือที่เจ้าหน้าที่ทำขึ้น",
  stamp_letter:    "หนังสือประทับตรา",
  secret_letter:   "หนังสือลับ",
};

const CONFIDENTIAL_ROLES = ["ADMIN", "DIRECTOR", "VICE_DIRECTOR", "CLERK"];

export default function NewOutboundPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [roleCode, setRoleCode] = useState<string>("TEACHER");
  const [uploading, setUploading] = useState(false);
  const [uploadedIntakeId, setUploadedIntakeId] = useState<number | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
  const [form, setForm] = useState({
    subject: "",
    bodyText: "",
    recipientOrg: "",
    recipientName: "",
    recipientEmail: "",
    sentMethod: "paper",
    urgencyLevel: "normal",
    letterType: "external_letter",
    securityLevel: "normal",
    documentNo: "",
  });

  useEffect(() => {
    const user = getUser();
    if (user?.roleCode) setRoleCode(user.roleCode);
  }, []);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const canSetConfidential = CONFIDENTIAL_ROLES.includes(roleCode);

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
      setUploadedFileName(data.originalFileName || file.name);
    } catch {
      toastError("อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim()) { toastWarning("กรุณากรอกชื่อเรื่อง"); return; }
    setLoading(true);
    try {
      const user = getUser() ?? {};
      const res = await apiFetch<{ id: number }>("/outbound/documents", {
        method: "POST",
        body: JSON.stringify({
          organizationId: (user as any).organizationId || 1,
          createdByUserId: (user as any).id,
          subject: form.subject,
          bodyText: form.bodyText || undefined,
          recipientOrg: form.recipientOrg || undefined,
          recipientName: form.recipientName || undefined,
          recipientEmail: form.recipientEmail || undefined,
          sentMethod: form.sentMethod,
          urgencyLevel: form.urgencyLevel,
          letterType: form.letterType,
          securityLevel: canSetConfidential ? form.securityLevel : "normal",
          intakeId: uploadedIntakeId || undefined,
        }),
      });
      router.push(`/outbound/${res.id}`);
    } catch (err: unknown) {
      toastError((err as Error).message || "สร้างเอกสารไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/saraban/outbound" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> ย้อนกลับ
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
          <SendHorizontal size={20} className="text-secondary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">ส่งเอกสาร</h1>
          <p className="text-xs text-on-surface-variant">สร้างหนังสือส่งออก</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm p-6 space-y-5">

        {/* ประเภทหนังสือ + เลขที่หนังสือ */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">ประเภทหนังสือ</label>
            <select
              value={form.letterType}
              onChange={(e) => update("letterType", e.target.value)}
              className="input-select w-full"
            >
              {Object.entries(LETTER_TYPE_LABEL).map(([v, l]) => {
                if (v === "secret_letter" && !canSetConfidential) return null;
                return <option key={v} value={v}>{l}</option>;
              })}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">เลขที่หนังสือ</label>
            <input
              type="text"
              value={form.documentNo}
              onChange={(e) => update("documentNo", e.target.value)}
              placeholder="อัตโนมัติเมื่ออนุมัติ"
              className="input-text w-full"
              disabled
            />
          </div>
        </div>

        {/* ชั้นความเร็ว + ชั้นความลับ */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">ชั้นความเร็ว</label>
            <select
              value={form.urgencyLevel}
              onChange={(e) => update("urgencyLevel", e.target.value)}
              className="input-select w-full"
            >
              <option value="normal">ทั่วไป</option>
              <option value="urgent">ด่วน</option>
              <option value="very_urgent">ด่วนที่สุด</option>
              <option value="most_urgent">ด่วนที่สุด</option>
            </select>
          </div>
          {canSetConfidential && (
            <div>
              <label className="text-sm font-semibold text-on-surface-variant mb-1 block">ชั้นความลับ</label>
              <select
                value={form.securityLevel}
                onChange={(e) => update("securityLevel", e.target.value)}
                className="input-select w-full"
              >
                <option value="normal">ไม่มีชั้นความลับ</option>
                <option value="secret">ลับ</option>
                <option value="top_secret">ลับมาก</option>
                <option value="most_secret">ลับที่สุด</option>
              </select>
            </div>
          )}
        </div>

        {/* ชื่อเรื่อง */}
        <div>
          <label className="text-sm font-semibold text-on-surface-variant mb-1 block">
            ชื่อเรื่อง <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => update("subject", e.target.value)}
            placeholder="ชื่อเรื่อง"
            className="input-text w-full"
            required
          />
        </div>

        {/* หน่วยงานผู้รับ + ชื่อผู้รับ */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">หน่วยงานผู้รับ</label>
            <input
              type="text"
              value={form.recipientOrg}
              onChange={(e) => update("recipientOrg", e.target.value)}
              placeholder="ชื่อหน่วยงานผู้รับ"
              className="input-text w-full"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">ชื่อผู้รับ</label>
            <input
              type="text"
              value={form.recipientName}
              onChange={(e) => update("recipientName", e.target.value)}
              placeholder="ชื่อผู้รับ"
              className="input-text w-full"
            />
          </div>
        </div>

        {/* อีเมลผู้รับ */}
        <div>
          <label className="text-sm font-semibold text-on-surface-variant mb-1 block">อีเมลผู้รับ</label>
          <input
            type="email"
            value={form.recipientEmail}
            onChange={(e) => update("recipientEmail", e.target.value)}
            placeholder="saraban@example.go.th"
            className="input-text w-full"
          />
        </div>

        {/* วิธีการส่ง */}
        <div>
          <label className="text-sm font-semibold text-on-surface-variant mb-2 block">วิธีการส่ง</label>
          <div className="flex gap-4">
            {[
              { value: "email", label: "อีเมล", icon: "📧" },
              { value: "line", label: "LINE", icon: "💬" },
              { value: "paper", label: "ส่งเอกสาร (กระดาษ)", icon: "📄" },
            ].map((opt) => (
              <label key={opt.value} className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer transition-colors ${form.sentMethod === opt.value ? "border-primary bg-primary/5 text-primary font-semibold" : "border-outline-variant/20 text-on-surface-variant hover:border-primary/30"}`}>
                <input
                  type="radio"
                  name="sentMethod"
                  value={opt.value}
                  checked={form.sentMethod === opt.value}
                  onChange={(e) => update("sentMethod", e.target.value)}
                  className="sr-only"
                />
                <span>{opt.icon}</span>
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* เนื้อหา */}
        <div>
          <label className="text-sm font-semibold text-on-surface-variant mb-1 block">เนื้อหา / หมายเหตุ</label>
          <textarea
            value={form.bodyText}
            onChange={(e) => update("bodyText", e.target.value)}
            placeholder="เนื้อหาหนังสือหรือหมายเหตุ"
            className="w-full p-3 rounded-xl border border-outline-variant/20 bg-surface-bright text-sm resize-none"
            rows={5}
          />
        </div>

        {/* File attachment */}
        <div>
          <label className="text-sm font-semibold text-on-surface-variant mb-1 block">แนบไฟล์เอกสาร</label>
          {uploadedFileName ? (
            <div className="flex items-center gap-3 p-3 rounded-xl border bg-blue-50 border-blue-200">
              <FileText size={18} className="text-blue-600 shrink-0" />
              <span className="text-sm font-medium text-on-surface flex-1 truncate">{uploadedFileName}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold flex items-center gap-1">
                <CheckCircle size={10} /> แนบแล้ว
              </span>
              {uploadedIntakeId && (
                <a
                  href={`${apiBase}/intake/${uploadedIntakeId}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                >
                  <Paperclip size={10} /> เปิด
                </a>
              )}
            </div>
          ) : (
            <label className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
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
                  <Loader2 size={24} className="animate-spin text-primary" />
                  <span className="text-sm text-primary font-semibold">กำลังอัปโหลด...</span>
                </>
              ) : (
                <>
                  <Upload size={24} className="text-gray-400" />
                  <span className="text-xs text-gray-400">PDF, รูปภาพ หรือ Word (ไม่เกิน 10MB)</span>
                </>
              )}
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-primary text-on-primary rounded-2xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95 disabled:opacity-50"
        >
          <SendHorizontal size={16} />
          {loading ? "กำลังบันทึก..." : "ส่งเอกสาร"}
        </button>
      </form>
    </div>
  );
}
