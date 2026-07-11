"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastError, toastWarning, toastSuccess } from "@/lib/toast";
import Link from "next/link";
import {
  ArrowLeft, SendHorizontal, Upload, Loader2, FileText, Paperclip,
  CheckCircle, Sparkles, Wand2, FileInput, Workflow,
} from "lucide-react";
import clsx from "clsx";
import { getUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";

const LETTER_TYPE_LABEL: Record<string, string> = {
  external_letter: "หนังสือภายนอก",
  internal_memo:   "หนังสือภายใน (บันทึกข้อความ)",
  stamp_letter:    "หนังสือประทับตรา",
  order:           "คำสั่ง",
  announcement:    "ประกาศ",
  pr_letter:       "หนังสือประชาสัมพันธ์",
  official_record: "หนังสือที่เจ้าหน้าที่ทำขึ้น",
  secret_letter:   "หนังสือลับ",
};

const AI_LETTER_TYPES = ["external_letter", "internal_memo", "stamp_letter", "order", "announcement"];

const AI_PROMPT_PLACEHOLDER: Record<string, string> = {
  external_letter:
    "เช่น: สร้างหนังสือถึง ผอ.สพป.เชียงราย เขต 3 เรื่องรายงานผลการดำเนินงานโครงการอ่านออกเขียนได้ ประจำภาคเรียนที่ 2/2568 พร้อมแนบรายงาน 1 ชุด",
  internal_memo:
    "เช่น: สร้างบันทึกข้อความเสนอผู้อำนวยการโรงเรียน เรื่องขออนุมัติจัดซื้อวัสดุการเรียนการสอน ประจำภาคเรียนที่ 2/2568 วงเงินไม่เกิน 50,000 บาท",
  stamp_letter:
    "เช่น: สร้างหนังสือประทับตราถึงองค์การบริหารส่วนตำบล... เรื่องขอใช้สถานที่จัดกิจกรรม วันที่ 15 พ.ค. 2569",
  order:
    "เช่น: สร้างคำสั่งแต่งตั้งคณะกรรมการประเมินผลการศึกษา ปีการศึกษา 2568 ประกอบด้วยประธาน 1 คน กรรมการ 3 คน และเลขานุการ 1 คน",
  announcement:
    "เช่น: สร้างประกาศรับสมัครนักเรียนชั้นประถมศึกษาปีที่ 1 ประจำปีการศึกษา 2569 รับสมัครตั้งแต่ 1-30 เม.ย. 2569 เวลา 08.30-16.30 น.",
};
const CONFIDENTIAL_ROLES = ["ADMIN", "DIRECTOR", "VICE_DIRECTOR", "CLERK"];

type CreateMode = "manual" | "ai_prompt" | "ai_inbound" | "dify_outline";

interface InboundCase {
  id: number;
  title: string;
  registrationNo: string | null;
  status: string;
  responseType?: string | null;
  requiresResponse?: boolean | null;
  hasBeenReplied?: boolean;
  documentNo?: string;
  documentDate?: string | null;
}

interface AiDraftResponse {
  /** Present when API already persisted an OutboundDocument draft */
  id?: number;
  subject?: string;
  bodyText?: string;
  recipientOrg?: string;
  recipientName?: string;
  letterType?: string;
  status?: string;
}

const RESPONSE_TYPE_LABEL_TH: Record<string, string> = {
  reply_required: "ต้องตอบ",
  action_required: "ดำเนินการ",
  report_required: "รายงานผล",
  informational: "เพื่อทราบ",
  unknown: "ไม่ทราบ",
};

const RESPONSE_TYPE_TO_DRAFT: Record<string, string> = {
  reply_required: "reply",
  action_required: "memo",
  report_required: "report",
};

function subscribeStorage(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function getRoleCode(): string {
  return getUser()?.roleCode ?? "TEACHER";
}

/** Section divider with title */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1 pb-0.5">
      <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60">{children}</span>
      <div className="flex-1 h-px bg-outline-variant/30" />
    </div>
  );
}

export default function NewOutboundPage() {
  const router = useRouter();
  const roleCode = useSyncExternalStore(subscribeStorage, getRoleCode, () => "TEACHER");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedIntakeId, setUploadedIntakeId] = useState<number | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  const [mode, setMode] = useState<CreateMode>("manual");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [inboundCases, setInboundCases] = useState<InboundCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [draftType, setDraftType] = useState("reply");
  const [additionalContext, setAdditionalContext] = useState("");
  const [showReplied, setShowReplied] = useState(false);

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

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const canSetConfidential = CONFIDENTIAL_ROLES.includes(roleCode);

  useEffect(() => {
    if (mode !== "ai_inbound") return;
    const user = getUser();
    if (!user?.organizationId) return;
    const params = new URLSearchParams({
      organizationId: String(user.organizationId),
      responseRequiredOnly: "true",
      includeReplied: showReplied ? "true" : "false",
      take: "50",
    });
    apiFetch<{ total: number; data: InboundCase[] }>(`/cases?${params}`)
      .then((res) => setInboundCases(res.data ?? []))
      .catch(() => setInboundCases([]));
  }, [mode, showReplied]);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) { toastWarning("กรุณาพิมพ์คำสั่งให้ AI"); return; }
    setAiGenerating(true);
    try {
      // API persists a draft OutboundDocument — open it instead of creating again on submit
      const res = await apiFetch<AiDraftResponse>("/outbound/ai-generate", {
        method: "POST",
        body: JSON.stringify({ letterType: form.letterType, prompt: aiPrompt }),
      });
      if (res.id) {
        toastSuccess("AI สร้างร่างแล้ว — เปิดหน้าแก้ไข");
        router.push(`/outbound/${res.id}`);
        return;
      }
      setForm((prev) => ({
        ...prev,
        subject: res.subject ?? prev.subject,
        bodyText: res.bodyText ?? prev.bodyText,
        recipientOrg: res.recipientOrg ?? prev.recipientOrg,
        recipientName: res.recipientName ?? prev.recipientName,
      }));
      toastSuccess("AI สร้าง draft สำเร็จ — กรุณาตรวจสอบและแก้ไข");
      setMode("manual");
    } catch (err: unknown) {
      toastError((err as Error).message || "AI สร้าง draft ไม่สำเร็จ");
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAiFromInbound = async () => {
    if (!selectedCaseId) { toastWarning("กรุณาเลือกหนังสือรับ"); return; }
    setAiGenerating(true);
    try {
      // API creates draft + links relatedInboundCaseId — redirect (no second POST)
      const res = await apiFetch<AiDraftResponse>("/outbound/ai-draft", {
        method: "POST",
        body: JSON.stringify({
          caseId: selectedCaseId,
          draftType,
          additionalContext: additionalContext || undefined,
        }),
      });
      if (res.id) {
        toastSuccess("AI สร้างร่างจากหนังสือรับแล้ว — เปิดหน้าแก้ไข");
        router.push(`/outbound/${res.id}`);
        return;
      }
      setForm((prev) => ({
        ...prev,
        subject: res.subject ?? prev.subject,
        bodyText: res.bodyText ?? prev.bodyText,
        recipientOrg: res.recipientOrg ?? prev.recipientOrg,
        recipientName: res.recipientName ?? prev.recipientName,
        letterType: res.letterType ?? prev.letterType,
      }));
      toastSuccess("AI สร้าง draft จากหนังสือรับสำเร็จ — กรุณาตรวจสอบ");
      setMode("manual");
    } catch (err: unknown) {
      toastError((err as Error).message || "AI สร้าง draft ไม่สำเร็จ");
    } finally {
      setAiGenerating(false);
    }
  };

  /** Phase 4: Dify Workflow outline → draft (no documentNo until approve) */
  const handleDifyOutline = async () => {
    if (!aiPrompt.trim()) {
      toastWarning("กรุณาพิมพ์คำสั่งให้ Dify");
      return;
    }
    setAiGenerating(true);
    try {
      const res = await apiFetch<AiDraftResponse>("/outbound/dify-outline", {
        method: "POST",
        body: JSON.stringify({
          letterType: form.letterType,
          prompt: aiPrompt,
        }),
      });
      if (res.id) {
        toastSuccess("Dify สร้างร่างหนังสือแล้ว — เปิดหน้าแก้ไข (ยังไม่มีเลขที่)");
        router.push(`/outbound/${res.id}`);
        return;
      }
      toastError("Dify ไม่คืน draft id");
    } catch (err: unknown) {
      toastError((err as Error).message || "Dify outline ไม่สำเร็จ");
    } finally {
      setAiGenerating(false);
    }
  };

  const handleDifyOutlineFromCase = async () => {
    if (!selectedCaseId) {
      toastWarning("กรุณาเลือกหนังสือรับ");
      return;
    }
    setAiGenerating(true);
    try {
      const res = await apiFetch<AiDraftResponse>("/outbound/dify-outline-from-case", {
        method: "POST",
        body: JSON.stringify({
          caseId: selectedCaseId,
          draftType,
          letterType: form.letterType,
          additionalContext: additionalContext || undefined,
        }),
      });
      if (res.id) {
        toastSuccess("Dify ร่างจากหนังสือรับแล้ว — เปิดหน้าแก้ไข");
        router.push(`/outbound/${res.id}`);
        return;
      }
      toastError("Dify ไม่คืน draft id");
    } catch (err: unknown) {
      toastError((err as Error).message || "Dify outline จากเคสไม่สำเร็จ");
    } finally {
      setAiGenerating(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBase}/intake/web-upload`, {
        method: "POST",
        credentials: "include",
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
      const user = getUser();
      const res = await apiFetch<{ id: number }>("/outbound/documents", {
        method: "POST",
        body: JSON.stringify({
          organizationId: user?.organizationId ?? 1,
          createdByUserId: user?.id,
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

  const MODE_OPTIONS: Array<{ key: CreateMode; label: string; icon: React.ElementType }> = [
    { key: "manual",      label: "สร้างเอง",                 icon: FileText  },
    { key: "ai_prompt",   label: "AI สร้างจาก Prompt",       icon: Sparkles  },
    { key: "ai_inbound",  label: "AI สร้างจากหนังสือรับ",    icon: FileInput },
    { key: "dify_outline", label: "Dify ร่างโครงหนังสือ",    icon: Workflow },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <Link href="/saraban/outbound" className="inline-flex items-center gap-1.5 text-primary hover:underline text-sm">
        <ArrowLeft size={15} /> ย้อนกลับ
      </Link>

      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
          <SendHorizontal size={20} className="text-secondary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">สร้างหนังสือส่ง</h1>
          <p className="text-xs text-on-surface-variant">สร้างด้วยตนเอง หรือให้ AI ช่วยร่าง</p>
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {MODE_OPTIONS.map(({ key, label, icon: Icon }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border",
                active
                  ? "bg-primary text-on-primary border-primary shadow-lg shadow-primary/20"
                  : "bg-surface-bright text-on-surface-variant hover:text-primary border-outline-variant/40",
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Phase 4: Dify Workflow outline */}
      {mode === "dify_outline" && (
        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-6 space-y-4">
          <div className="flex items-center gap-2 font-bold text-violet-800 dark:text-violet-200">
            <Workflow size={18} /> Dify Workflow — ร่างโครงหนังสือส่ง
          </div>
          <p className="text-xs text-on-surface-variant">
            ใช้ Dify Workflow สร้างร่าง (subject / ผู้รับ / เนื้อหา) แล้วบันทึกเป็น OutboundDocument
            สถานะ draft — <strong>ยังไม่ออกเลขที่</strong> จนกว่าจะอนุมัติ
            ต้องตั้ง <code className="font-mono text-[11px]">DIFY_API_KEY_OUTBOUND_OUTLINE</code> หรือ{" "}
            <code className="font-mono text-[11px]">DIFY_API_KEY_WORKFLOW</code>
          </p>
          <div className="grid grid-cols-1 gap-4">
            <Field>
              <FieldLabel htmlFor="dify-letter-type">ประเภทหนังสือ</FieldLabel>
              <NativeSelect
                id="dify-letter-type"
                value={form.letterType}
                onChange={(e) => update("letterType", e.target.value)}
              >
                {AI_LETTER_TYPES.map((v) => (
                  <option key={v} value={v}>{LETTER_TYPE_LABEL[v]}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="dify-prompt" required>คำสั่ง / โครงเรื่อง</FieldLabel>
              <Textarea
                id="dify-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={AI_PROMPT_PLACEHOLDER[form.letterType] ?? AI_PROMPT_PLACEHOLDER.external_letter}
                rows={4}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dify-case">หรือเลือกหนังสือรับ (ถ้ามี)</FieldLabel>
              <NativeSelect
                id="dify-case"
                value={selectedCaseId ?? ""}
                onChange={(e) => setSelectedCaseId(e.target.value ? Number(e.target.value) : null)}
                onFocus={() => {
                  if (inboundCases.length === 0) {
                    const user = getUser();
                    if (!user?.organizationId) return;
                    const params = new URLSearchParams({
                      organizationId: String(user.organizationId),
                      take: "50",
                    });
                    apiFetch<{ total: number; data: InboundCase[] }>(`/cases?${params}`)
                      .then((res) => setInboundCases(res.data ?? []))
                      .catch(() => setInboundCases([]));
                  }
                }}
              >
                <option value="">— ใช้เฉพาะคำสั่งด้านบน —</option>
                {inboundCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.id} {c.registrationNo ? `[${c.registrationNo}] ` : ""}
                    {c.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              size="lg"
              onClick={handleDifyOutline}
              disabled={aiGenerating || !aiPrompt.trim()}
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
            >
              {aiGenerating ? (
                <><Loader2 className="animate-spin" size={16} /> กำลังรัน Dify…</>
              ) : (
                <><Workflow size={16} /> ร่างจากคำสั่ง (Dify)</>
              )}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={handleDifyOutlineFromCase}
              disabled={aiGenerating || !selectedCaseId}
              className="flex-1 border-violet-500/40"
            >
              {aiGenerating ? (
                <><Loader2 className="animate-spin" size={16} /> กำลังรัน…</>
              ) : (
                <><FileInput size={16} /> ร่างจากหนังสือรับ (Dify)</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* AI Prompt panel */}
      {mode === "ai_prompt" && (
        <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-6 space-y-4">
          <div className="flex items-center gap-2 font-bold text-purple-700 dark:text-purple-300">
            <Sparkles size={18} /> AI สร้างหนังสือจากคำสั่ง
          </div>
          <div className="grid grid-cols-1 gap-4">
            <Field>
              <FieldLabel htmlFor="ai-letter-type">ประเภทหนังสือ</FieldLabel>
              <NativeSelect id="ai-letter-type" value={form.letterType} onChange={(e) => update("letterType", e.target.value)}>
                {AI_LETTER_TYPES.map((v) => <option key={v} value={v}>{LETTER_TYPE_LABEL[v]}</option>)}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="ai-prompt" required>พิมพ์คำสั่งให้ AI</FieldLabel>
              <Textarea
                id="ai-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={AI_PROMPT_PLACEHOLDER[form.letterType] ?? AI_PROMPT_PLACEHOLDER.external_letter}
                rows={4}
              />
            </Field>
          </div>
          <Button
            type="button" size="lg" onClick={handleAiGenerate}
            disabled={aiGenerating || !aiPrompt.trim()}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/20 dark:bg-purple-500 dark:hover:bg-purple-400"
          >
            {aiGenerating
              ? <><Loader2 size={16} className="animate-spin" /> AI กำลังสร้าง...</>
              : <><Wand2 size={16} /> สร้างด้วย AI</>}
          </Button>
        </div>
      )}

      {/* AI from Inbound panel */}
      {mode === "ai_inbound" && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-blue-700 dark:text-blue-300">
              <FileInput size={18} /> AI สร้างจากหนังสือรับ
            </div>
            <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer select-none">
              <Checkbox checked={showReplied} onCheckedChange={(v) => setShowReplied(v === true)} />
              แสดงหนังสือที่ตอบแล้ว
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="inbound-case">
                เลือกหนังสือรับ
                <span className="ml-1 text-xs text-on-surface-variant/70 font-normal">
                  ({inboundCases.length} ฉบับ — เฉพาะที่ต้องตอบสนอง)
                </span>
              </FieldLabel>
              <NativeSelect id="inbound-case" value={selectedCaseId ?? ""} onChange={(e) => {
                const id = Number(e.target.value) || null;
                setSelectedCaseId(id);
                if (id) {
                  const c = inboundCases.find((x) => x.id === id);
                  const next = c?.responseType ? RESPONSE_TYPE_TO_DRAFT[c.responseType] : null;
                  if (next) setDraftType(next);
                }
              }}>
                <option value="">-- เลือกหนังสือรับ --</option>
                {inboundCases.map((c) => {
                  const badge = c.responseType ? `[${RESPONSE_TYPE_LABEL_TH[c.responseType] ?? c.responseType}] ` : "";
                  const replied = c.hasBeenReplied ? " ✓ตอบแล้ว" : "";
                  const ref = c.registrationNo || c.documentNo;
                  return <option key={c.id} value={c.id}>{badge}{ref ? `${ref} - ` : ""}{c.title}{replied}</option>;
                })}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="draft-type">ประเภท draft</FieldLabel>
              <NativeSelect id="draft-type" value={draftType} onChange={(e) => setDraftType(e.target.value)}>
                <option value="reply">หนังสือตอบกลับ (ภายนอก)</option>
                <option value="memo">บันทึกเสนอผู้บริหาร (ภายใน)</option>
                <option value="report">รายงานผลการดำเนินงาน</option>
                <option value="order">คำสั่ง</option>
                <option value="announcement">ประกาศ</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="additional-context">บริบทเพิ่มเติม (ถ้ามี)</FieldLabel>
              <Textarea
                id="additional-context"
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="เช่น: ให้ตอบรับและแจ้งรายชื่อผู้เข้าร่วม 3 คน"
                rows={2}
              />
            </Field>
          </div>
          <Button
            type="button" size="lg" onClick={handleAiFromInbound}
            disabled={aiGenerating || !selectedCaseId}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            {aiGenerating
              ? <><Loader2 size={16} className="animate-spin" /> AI กำลังสร้าง...</>
              : <><Wand2 size={16} /> สร้างจากหนังสือรับ</>}
          </Button>
        </div>
      )}

      {/* Main form */}
      <form onSubmit={handleSubmit} className="rounded-2xl border border-outline-variant/30 bg-surface-bright shadow-sm divide-y divide-outline-variant/20">

        {/* ─── Section 1: ข้อมูลหนังสือ ─── */}
        <div className="p-6 space-y-4">
          <SectionTitle>ข้อมูลหนังสือ</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field className="lg:col-span-2">
              <FieldLabel>ประเภทหนังสือ</FieldLabel>
              <NativeSelect value={form.letterType} onChange={(e) => update("letterType", e.target.value)}>
                {Object.entries(LETTER_TYPE_LABEL).map(([v, l]) => {
                  if (v === "secret_letter" && !canSetConfidential) return null;
                  return <option key={v} value={v}>{l}</option>;
                })}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>เลขที่หนังสือ</FieldLabel>
              <Input
                type="text"
                value={form.documentNo}
                placeholder="ออกเลขอัตโนมัติเมื่ออนุมัติ (ทะเบียนส่ง)"
                disabled
              />
            </Field>
          </div>

          <div className={clsx("grid gap-4", canSetConfidential ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}>
            <Field>
              <FieldLabel>ชั้นความเร็ว</FieldLabel>
              <NativeSelect value={form.urgencyLevel} onChange={(e) => update("urgencyLevel", e.target.value)}>
                <option value="normal">ทั่วไป</option>
                <option value="urgent">ด่วน</option>
                <option value="very_urgent">ด่วนมาก</option>
                <option value="most_urgent">ด่วนที่สุด</option>
              </NativeSelect>
            </Field>
            {canSetConfidential && (
              <Field>
                <FieldLabel>ชั้นความลับ</FieldLabel>
                <NativeSelect value={form.securityLevel} onChange={(e) => update("securityLevel", e.target.value)}>
                  <option value="normal">ไม่มีชั้นความลับ</option>
                  <option value="secret">ลับ</option>
                  <option value="top_secret">ลับมาก</option>
                  <option value="most_secret">ลับที่สุด</option>
                </NativeSelect>
              </Field>
            )}
          </div>

          <Field>
            <FieldLabel required>ชื่อเรื่อง</FieldLabel>
            <Input
              type="text"
              value={form.subject}
              onChange={(e) => update("subject", e.target.value)}
              placeholder="ชื่อเรื่อง"
              required
            />
          </Field>
        </div>

        {/* ─── Section 2: ผู้รับ ─── */}
        <div className="p-6 space-y-4">
          <SectionTitle>ผู้รับหนังสือ</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field>
              <FieldLabel>หน่วยงานผู้รับ</FieldLabel>
              <Input
                type="text"
                value={form.recipientOrg}
                onChange={(e) => update("recipientOrg", e.target.value)}
                placeholder="ชื่อหน่วยงานผู้รับ"
              />
            </Field>
            <Field>
              <FieldLabel>ชื่อผู้รับ / ตำแหน่ง</FieldLabel>
              <Input
                type="text"
                value={form.recipientName}
                onChange={(e) => update("recipientName", e.target.value)}
                placeholder="เช่น ผู้อำนวยการโรงเรียน..."
              />
            </Field>
          </div>
          <Field>
            <FieldLabel>อีเมลผู้รับ</FieldLabel>
            <Input
              type="email"
              value={form.recipientEmail}
              onChange={(e) => update("recipientEmail", e.target.value)}
              placeholder="saraban@example.go.th"
            />
          </Field>
        </div>

        {/* ─── Section 3: การส่ง ─── */}
        <div className="p-6 space-y-4">
          <SectionTitle>วิธีการส่ง</SectionTitle>
          <div className="flex gap-3 flex-wrap">
            {[
              { value: "email", label: "อีเมล" },
              { value: "line",  label: "LINE" },
              { value: "paper", label: "ส่งเอกสาร (กระดาษ)" },
            ].map((opt) => {
              const active = form.sentMethod === opt.value;
              return (
                <label
                  key={opt.value}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-outline-variant/40 text-on-surface-variant hover:border-primary/40",
                  )}
                >
                  <input
                    type="radio"
                    name="sentMethod"
                    value={opt.value}
                    checked={active}
                    onChange={(e) => update("sentMethod", e.target.value)}
                    className="sr-only"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* ─── Section 4: เนื้อหา ─── */}
        <div className="p-6 space-y-4">
          <SectionTitle>เนื้อหาและไฟล์แนบ</SectionTitle>
          <Field>
            <FieldLabel>เนื้อหา</FieldLabel>
            <Textarea
              value={form.bodyText}
              onChange={(e) => update("bodyText", e.target.value)}
              placeholder="เนื้อหาหนังสือ"
              rows={8}
            />
          </Field>

          <Field>
            <FieldLabel>แนบไฟล์เอกสาร</FieldLabel>
            {uploadedFileName ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5">
                <FileText size={18} className="text-primary shrink-0" />
                <span className="text-sm font-medium text-on-surface flex-1 truncate">{uploadedFileName}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1">
                  <CheckCircle size={10} /> แนบแล้ว
                </span>
                {uploadedIntakeId && (
                  <a
                    href={`${apiBase}/intake/${uploadedIntakeId}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-primary text-on-primary rounded-lg font-bold hover:brightness-110"
                  >
                    <Paperclip size={10} /> เปิด
                  </a>
                )}
              </div>
            ) : (
              <label
                className={clsx(
                  "flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
                  uploading
                    ? "border-primary/50 bg-primary/5"
                    : "border-outline-variant/60 hover:border-primary/50 hover:bg-primary/5",
                )}
              >
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
                  <><Loader2 size={24} className="animate-spin text-primary" />
                  <span className="text-sm text-primary font-semibold">กำลังอัปโหลด...</span></>
                ) : (
                  <><Upload size={24} className="text-on-surface-variant" />
                  <span className="text-xs text-on-surface-variant">PDF, รูปภาพ หรือ Word (ไม่เกิน 10MB)</span></>
                )}
              </label>
            )}
          </Field>
        </div>

        {/* ─── Submit ─── */}
        <div className="p-6">
          <Button type="submit" size="lg" disabled={loading} className="w-full">
            <SendHorizontal size={16} />
            {loading ? "กำลังบันทึก..." : "บันทึกหนังสือส่ง"}
          </Button>
        </div>

      </form>
    </div>
  );
}
