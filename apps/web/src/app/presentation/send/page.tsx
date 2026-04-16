"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Send, ArrowLeft } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PresentationSendPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    description: "",
    fileUrl: "",
    receiverUserId: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title) {
      toastError("กรุณากรอกชื่อแฟ้ม");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/presentation", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          receiverUserId: form.receiverUserId ? Number(form.receiverUserId) : undefined,
        }),
      });
      toastSuccess("ส่งแฟ้มนำเสนอสำเร็จ");
      router.push("/presentation/register-out");
    } catch {
      toastError("ส่งแฟ้มไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/presentation" className="btn-ghost p-2">
          <ArrowLeft size={18} />
        </Link>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Send size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">ส่งแฟ้มนำเสนอ</h1>
          <p className="text-xs text-on-surface-variant">สร้างแฟ้มนำเสนอและส่งให้ผู้บริหารพิจารณา</p>
        </div>
      </div>

      <div className="max-w-2xl">
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/20 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-on-surface-variant mb-1.5 block">ชื่อแฟ้ม / เรื่อง *</label>
              <input
                className="input-text w-full"
                placeholder="ชื่อแฟ้มนำเสนอ..."
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-on-surface-variant mb-1.5 block">รายละเอียด</label>
              <textarea
                className="input-text w-full h-28 resize-none"
                placeholder="รายละเอียดแฟ้มนำเสนอ..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-on-surface-variant mb-1.5 block">URL ไฟล์แนบ</label>
              <input
                className="input-text w-full"
                placeholder="https://..."
                value={form.fileUrl}
                onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Link href="/presentation" className="btn-ghost">ยกเลิก</Link>
              <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving}>
                <Send size={16} />
                {saving ? "กำลังส่ง..." : "ส่งแฟ้มนำเสนอ"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
