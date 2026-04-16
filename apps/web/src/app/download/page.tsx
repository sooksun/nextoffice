"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatThaiDateShort } from "@/lib/thai-date";
import { Download, Plus, X, FileText, File } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";

const CATEGORY_LABEL: Record<string, string> = {
  general: "ทั่วไป",
  form: "แบบฟอร์ม",
  manual: "คู่มือ",
  regulation: "ระเบียบ/กฎหมาย",
  announcement: "ประกาศ",
};

interface DownloadFile {
  id: number;
  title: string;
  description: string | null;
  category: string;
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  downloadCount: number;
  createdAt: string;
  uploadedBy: { id: number; fullName: string } | null;
}

export default function DownloadPage() {
  const [items, setItems] = useState<DownloadFile[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "general",
    fileUrl: "",
    fileName: "",
  });
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (search) params.set("search", search);
      const res = await apiFetch<{ total: number; data: DownloadFile[] }>(`/download?${params}`);
      setItems(res.data);
      setTotal(res.total);
    } catch {
      toastError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [category]);

  async function handleDownload(item: DownloadFile) {
    try {
      await apiFetch(`/download/${item.id}/download`, { method: "POST" });
      window.open(item.fileUrl, "_blank");
    } catch {
      window.open(item.fileUrl, "_blank");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.fileUrl) {
      toastError("กรุณากรอกชื่อและ URL ไฟล์");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/download", {
        method: "POST",
        body: JSON.stringify({ ...form, fileName: form.fileName || form.title }),
      });
      toastSuccess("เพิ่มไฟล์สำเร็จ");
      setShowForm(false);
      setForm({ title: "", description: "", category: "general", fileUrl: "", fileName: "" });
      fetchData();
    } catch {
      toastError("เพิ่มไฟล์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Download size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">ดาวน์โหลด</h1>
            <p className="text-xs text-on-surface-variant">ไฟล์และเอกสารสำหรับดาวน์โหลด — พบ {total} รายการ</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> เพิ่มไฟล์
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-5">
        <select className="input-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">ทุกหมวดหมู่</option>
          {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input
          type="text"
          placeholder="ค้นหาชื่อไฟล์..."
          className="input-text flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchData()}
        />
        <button onClick={fetchData} className="btn-primary">ค้นหา</button>
      </div>

      {/* File Grid */}
      {loading ? (
        <div className="text-center py-10 text-on-surface-variant">กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <Download size={40} className="mx-auto mb-3 opacity-30" />
          <p>ยังไม่มีไฟล์ดาวน์โหลด</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-on-surface line-clamp-2 leading-relaxed">{item.title}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-bright text-on-surface-variant font-medium mt-1 inline-block">
                    {CATEGORY_LABEL[item.category] ?? item.category}
                  </span>
                </div>
              </div>
              {item.description && (
                <p className="text-xs text-on-surface-variant line-clamp-2">{item.description}</p>
              )}
              <div className="flex items-center justify-between text-xs text-on-surface-variant mt-auto pt-2 border-t border-outline-variant/10">
                <span>{formatThaiDateShort(item.createdAt)}</span>
                <div className="flex items-center gap-1">
                  <Download size={11} />
                  <span>{item.downloadCount}</span>
                  {item.fileSize && <span className="ml-1 opacity-60">{formatFileSize(item.fileSize)}</span>}
                </div>
              </div>
              <button
                onClick={() => handleDownload(item)}
                className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2"
              >
                <Download size={14} /> ดาวน์โหลด
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-lowest rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-primary">เพิ่มไฟล์ดาวน์โหลด</h2>
              <button onClick={() => setShowForm(false)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">ชื่อไฟล์ / หัวข้อ *</label>
                <input className="input-text w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">หมวดหมู่</label>
                <select className="input-select w-full" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">URL ไฟล์ *</label>
                <input className="input-text w-full" placeholder="https://..." value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">คำอธิบาย</label>
                <textarea className="input-text w-full h-20 resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">ยกเลิก</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? "กำลังบันทึก..." : "เพิ่มไฟล์"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
