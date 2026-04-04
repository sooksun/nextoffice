"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft,
  BookOpen,
  Lightbulb,
  Save,
  Loader2,
} from "lucide-react";

type KnowledgeType = "policy" | "horizon";

const MANDATORY_LEVELS = [
  { value: "mandatory", label: "บังคับ (Mandatory)" },
  { value: "recommended", label: "แนะนำ (Recommended)" },
  { value: "optional", label: "ทางเลือก (Optional)" },
];

export default function NewKnowledgePage() {
  const router = useRouter();
  const [type, setType] = useState<KnowledgeType>("policy");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    summary: "",
    fullText: "",
    issuingAuthority: "",
    mandatoryLevel: "mandatory",
    clauseText: "",
  });

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("กรุณากรอกชื่อระเบียบ/แนวปฏิบัติ");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await apiFetch("/knowledge", {
        method: "POST",
        body: JSON.stringify({ type, ...form }),
      });
      router.push("/knowledge");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/knowledge"
          className="w-9 h-9 rounded-xl bg-surface-bright flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
            เพิ่มข้อมูลความรู้
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            เพิ่มระเบียบ นโยบาย หรือแนวปฏิบัติให้กับระบบ AI สารบรรณ
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Type selector */}
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-1 flex gap-1">
          <button
            type="button"
            onClick={() => setType("policy")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
              type === "policy"
                ? "bg-primary text-on-primary shadow-md shadow-primary/20"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            <BookOpen size={16} />
            ระเบียบ / นโยบาย
          </button>
          <button
            type="button"
            onClick={() => setType("horizon")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
              type === "horizon"
                ? "bg-tertiary text-on-tertiary shadow-md shadow-tertiary/20"
                : "text-on-surface-variant hover:text-tertiary"
            }`}
          >
            <Lightbulb size={16} />
            แนวปฏิบัติ / นวัตกรรม
          </button>
        </div>

        {/* Main form card */}
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-6 space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-on-surface">
              ชื่อระเบียบ / แนวปฏิบัติ <span className="text-error">*</span>
            </label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder={
                type === "policy"
                  ? "เช่น ระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ พ.ศ. 2526"
                  : "เช่น แนวปฏิบัติการรับ-ส่งเอกสารดิจิทัล"
              }
              className="w-full px-4 py-3 rounded-xl bg-surface border border-outline-variant/20 text-on-surface placeholder-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>

          {/* Issuing Authority */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-on-surface">
              หน่วยงานที่ออก
            </label>
            <input
              name="issuingAuthority"
              value={form.issuingAuthority}
              onChange={handleChange}
              placeholder="เช่น สำนักนายกรัฐมนตรี, สพฐ., กระทรวงศึกษาธิการ"
              className="w-full px-4 py-3 rounded-xl bg-surface border border-outline-variant/20 text-on-surface placeholder-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>

          {/* Mandatory Level (policy only) */}
          {type === "policy" && (
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-on-surface">
                ระดับความบังคับใช้
              </label>
              <select
                name="mandatoryLevel"
                value={form.mandatoryLevel}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl bg-surface border border-outline-variant/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all appearance-none"
              >
                {MANDATORY_LEVELS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Summary */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-on-surface">
              สรุปสาระสำคัญ
            </label>
            <textarea
              name="summary"
              value={form.summary}
              onChange={handleChange}
              rows={3}
              placeholder="สรุปสาระสำคัญของระเบียบหรือแนวปฏิบัติ เพื่อให้ AI ใช้ตอบคำถาม..."
              className="w-full px-4 py-3 rounded-xl bg-surface border border-outline-variant/20 text-on-surface placeholder-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
            />
          </div>

          {/* Full Text */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-on-surface">
              เนื้อหาฉบับเต็ม
            </label>
            <textarea
              name="fullText"
              value={form.fullText}
              onChange={handleChange}
              rows={6}
              placeholder="วางเนื้อหาเต็มของระเบียบหรือแนวปฏิบัติที่นี่..."
              className="w-full px-4 py-3 rounded-xl bg-surface border border-outline-variant/20 text-on-surface placeholder-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
            />
          </div>

          {/* Clause Text (policy only) */}
          {type === "policy" && (
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-on-surface">
                ข้อกำหนด / มาตรา หลัก
                <span className="text-outline font-normal ml-1">(ตัวอย่าง)</span>
              </label>
              <textarea
                name="clauseText"
                value={form.clauseText}
                onChange={handleChange}
                rows={3}
                placeholder="เช่น ข้อ 1 ระเบียบนี้เรียกว่า 'ระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ พ.ศ. 2526'..."
                className="w-full px-4 py-3 rounded-xl bg-surface border border-outline-variant/20 text-on-surface placeholder-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
              />
              <p className="text-[11px] text-outline">
                ระบุข้อกำหนดหลัก 1 ข้อ (สามารถเพิ่มเพิ่มเติมได้ภายหลัง)
              </p>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-xl bg-error-container text-on-error-container text-sm font-medium">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-3 bg-primary text-on-primary rounded-2xl font-bold text-sm shadow-md shadow-primary/20 hover:brightness-110 transition-all disabled:opacity-60 disabled:pointer-events-none"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {isSubmitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
          </button>
          <Link
            href="/knowledge"
            className="px-5 py-3 rounded-2xl text-sm font-semibold text-on-surface-variant hover:text-primary hover:bg-surface-bright transition-colors"
          >
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
