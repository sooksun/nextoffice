"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, FilePlus } from "lucide-react";

export default function NewInboxPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    documentNo: "",
    documentDate: "",
    senderOrg: "",
    urgencyLevel: "normal",
    dueDate: "",
    description: "",
  });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return alert("กรุณากรอกชื่อเรื่อง");
    setLoading(true);
    try {
      const res = await apiFetch<{ caseId: number }>("/cases/manual", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          documentNo: form.documentNo || undefined,
          documentDate: form.documentDate || undefined,
          senderOrg: form.senderOrg || undefined,
          urgencyLevel: form.urgencyLevel,
          dueDate: form.dueDate || undefined,
          description: form.description || undefined,
        }),
      });
      router.push(`/inbox/${res.caseId}`);
    } catch (err: any) {
      alert(err.message || "สร้างเอกสารไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-2xl font-black text-primary tracking-tight">รับเอกสารใหม่</h1>
          <p className="text-xs text-on-surface-variant">กรอกข้อมูลเอกสารด้วยมือ</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">ประเภทหนังสือ</label>
            <select
              value={form.urgencyLevel}
              onChange={(e) => update("urgencyLevel", e.target.value)}
              className="input-select w-full"
            >
              <option value="normal">ทั่วไป</option>
              <option value="urgent">ด่วน</option>
              <option value="very_urgent">ด่วนมาก</option>
              <option value="most_urgent">ด่วนที่สุด</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">เลขที่หนังสือ</label>
            <input
              type="text"
              value={form.documentNo}
              onChange={(e) => update("documentNo", e.target.value)}
              placeholder="เลขที่หนังสือ"
              className="input-text w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">หนังสือลงวันที่</label>
            <input
              type="date"
              value={form.documentDate}
              onChange={(e) => update("documentDate", e.target.value)}
              className="input-date w-full"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">กำหนดเสร็จ</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => update("dueDate", e.target.value)}
              className="input-date w-full"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-on-surface-variant mb-1 block">หน่วยงานที่ส่ง</label>
          <input
            type="text"
            value={form.senderOrg}
            onChange={(e) => update("senderOrg", e.target.value)}
            placeholder="ชื่อหน่วยงานผู้ส่ง"
            className="input-text w-full"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-on-surface-variant mb-1 block">
            ชื่อเรื่อง <span className="text-red-500">*</span>
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

        <div>
          <label className="text-sm font-semibold text-on-surface-variant mb-1 block">หมายเหตุ</label>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="หมายเหตุ"
            className="w-full p-3 rounded-xl border border-outline-variant/20 bg-surface-bright text-sm resize-none"
            rows={3}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-primary text-on-primary rounded-2xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95 disabled:opacity-50"
        >
          <FilePlus size={16} />
          {loading ? "กำลังบันทึก..." : "บันทึกเอกสาร"}
        </button>
      </form>
    </div>
  );
}
