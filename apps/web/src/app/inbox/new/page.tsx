"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastError, toastSuccess, toastWarning } from "@/lib/toast";
import Link from "next/link";
import {
  ArrowLeft, FilePlus, FileText, CheckCircle, Loader2, Upload, X, Sparkles,
} from "lucide-react";
import clsx from "clsx";
import ThaiDatePicker from "@/components/ui/ThaiDatePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

const URGENCY_OPTIONS = [
  { value: "normal",      label: "ทั่วไป" },
  { value: "urgent",      label: "ด่วน" },
  { value: "very_urgent", label: "ด่วนมาก" },
  { value: "most_urgent", label: "ด่วนที่สุด" },
];

interface AttachedFile {
  intakeId: number;
  fileName: string;
  mimeType: string;
}

interface IntakeAiResult {
  subjectText?: string | null;
  documentNo?: string | null;
  issuingAuthority?: string | null;
  summaryText?: string | null;
  urgency?: string | null;
  deadlineDate?: string | null;
  documentDate?: string | null;
}

interface IntakeDetail {
  id: number;
  originalFileName?: string | null;
  mimeType?: string | null;
  aiResult?: IntakeAiResult | null;
}

function mapUrgencyToForm(u: string | null | undefined): string {
  const low = (u ?? "").toLowerCase();
  if (["high", "most_urgent", "very_urgent"].includes(low)) return "very_urgent";
  if (["medium", "urgent"].includes(low)) return "urgent";
  return "normal";
}

function NewInboxForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intakeIdParam = searchParams.get("intakeId");

  const [loading, setLoading]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [attached, setAttached]   = useState<AttachedFile | null>(null);
  const prefillDone = useRef(false);

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

  // When coming from DocumentUploadModal, pre-fill from intake + attach the file.
  useEffect(() => {
    if (!intakeIdParam || prefillDone.current) return;
    prefillDone.current = true;
    const id = Number(intakeIdParam);
    if (!Number.isFinite(id)) return;

    setPrefilling(true);
    apiFetch<IntakeDetail>(`/intake/${id}`)
      .then((intake) => {
        const ai = intake.aiResult ?? null;
        if (ai) {
          setForm((prev) => ({
            ...prev,
            title: ai.subjectText ?? prev.title,
            documentNo: ai.documentNo ?? prev.documentNo,
            documentDate: ai.documentDate ?? prev.documentDate,
            senderOrg: ai.issuingAuthority ?? prev.senderOrg,
            urgencyLevel: mapUrgencyToForm(ai.urgency),
            dueDate: ai.deadlineDate ? ai.deadlineDate.split("T")[0] : prev.dueDate,
            description: ai.summaryText ?? prev.description,
          }));
        }
        setAttached({
          intakeId: intake.id,
          fileName: intake.originalFileName ?? `intake-${intake.id}`,
          mimeType: intake.mimeType ?? "application/octet-stream",
        });
      })
      .catch(() => {
        toastError("โหลดข้อมูล intake ไม่สำเร็จ");
      })
      .finally(() => setPrefilling(false));
  }, [intakeIdParam]);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

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

      {/* AI prefill banner */}
      {prefilling && (
        <div className="mb-5 flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 text-sm text-primary">
          <Loader2 size={16} className="animate-spin" />
          กำลังโหลดข้อมูลจาก AI...
        </div>
      )}
      {!prefilling && intakeIdParam && attached && (
        <div className="mb-5 flex items-start gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5">
          <Sparkles size={16} className="text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-primary">ฟอร์มถูกเติมอัตโนมัติจาก AI</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              ตรวจสอบ/แก้ไขข้อมูลด้านล่างก่อนกดลงทะเบียน
            </p>
          </div>
        </div>
      )}

      {/* File attachment */}
      {!attached ? (
        <label className={clsx(
          "flex flex-col items-center gap-2 p-6 rounded-2xl border-2 border-dashed cursor-pointer mb-5 transition-colors",
          uploading
            ? "border-primary/50 bg-primary/5 pointer-events-none"
            : "border-outline-variant/50 hover:border-primary/50 hover:bg-primary/5",
        )}>
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
              <Upload size={28} className="text-on-surface-variant" />
              <span className="text-sm text-on-surface-variant font-semibold">แนบสำเนาหนังสือ (ไม่บังคับ)</span>
              <span className="text-xs text-on-surface-variant/70">PDF, รูปภาพ หรือ Word — เพื่อแนบต้นฉบับไว้ในระบบ</span>
            </>
          )}
        </label>
      ) : (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-primary/30 bg-primary/5 mb-5">
          <div className="w-9 h-9 rounded-xl bg-surface-bright border border-outline-variant/40 flex items-center justify-center shrink-0">
            <FileText size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-on-surface truncate">{attached.fileName}</p>
            <p className="text-xs text-on-surface-variant">{attached.mimeType}</p>
          </div>
          <button
            type="button"
            onClick={() => setAttached(null)}
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
            title="ยกเลิกไฟล์แนบ"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Form */}
      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* ชั้นความเร็ว + เลขที่หนังสือ + วันที่หนังสือ */}
            <div className="grid grid-cols-3 gap-4">
              <Field>
                <FieldLabel required>ชั้นความเร็ว</FieldLabel>
                <NativeSelect
                  value={form.urgencyLevel}
                  onChange={(e) => update("urgencyLevel", e.target.value)}
                >
                  {URGENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>เลขที่หนังสือ</FieldLabel>
                <Input
                  type="text"
                  value={form.documentNo}
                  onChange={(e) => update("documentNo", e.target.value)}
                  placeholder="เช่น ที่ ศธ 04045/ว11081"
                />
              </Field>
              <Field>
                <FieldLabel>หนังสือลงวันที่</FieldLabel>
                <ThaiDatePicker value={form.documentDate} onChange={(v) => update("documentDate", v)} />
              </Field>
            </div>

            {/* จาก / ถึง */}
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>จาก (หน่วยงานที่ส่ง)</FieldLabel>
                <Input
                  type="text"
                  value={form.senderOrg}
                  onChange={(e) => update("senderOrg", e.target.value)}
                  placeholder="ชื่อหน่วยงานผู้ส่ง"
                />
              </Field>
              <Field>
                <FieldLabel>ถึง (ผู้รับ)</FieldLabel>
                <Input
                  type="text"
                  value={form.recipientNote}
                  onChange={(e) => update("recipientNote", e.target.value)}
                  placeholder="เช่น ผู้อำนวยการโรงเรียน"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel required>เรื่อง (ชื่อเรื่อง)</FieldLabel>
              <Input
                type="text"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="ระบุชื่อเรื่องของหนังสือ"
                required
              />
            </Field>

            <Field>
              <FieldLabel>กำหนดเสร็จ / วันครบกำหนด</FieldLabel>
              <ThaiDatePicker value={form.dueDate} onChange={(v) => update("dueDate", v)} />
            </Field>

            <Field>
              <FieldLabel>หมายเหตุ / สรุปเนื้อหา</FieldLabel>
              <Textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="หมายเหตุหรือสรุปเนื้อหาโดยย่อ"
                rows={4}
              />
            </Field>

            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-violet-500/30 hover:brightness-110 hover:shadow-violet-500/50"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> กำลังบันทึก...</>
              ) : (
                <><CheckCircle size={16} /> ลงทะเบียนรับเอกสาร</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
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
