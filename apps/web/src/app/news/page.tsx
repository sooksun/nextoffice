"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatThaiDateShort } from "@/lib/thai-date";
import { Newspaper, Plus, Pin, Eye, X } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";

interface NewsPost {
  id: number;
  title: string;
  content: string;
  imageUrl: string | null;
  isPinned: boolean;
  viewCount: number;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  author: { id: number; fullName: string } | null;
}

export default function NewsPage() {
  const [items, setItems] = useState<NewsPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NewsPost | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", imageUrl: "", isPinned: false });
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await apiFetch<{ total: number; data: NewsPost[] }>("/news?status=published");
      setItems(res.data);
      setTotal(res.total);
    } catch {
      toastError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.content) {
      toastError("กรุณากรอกหัวข้อและเนื้อหา");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/news", { method: "POST", body: JSON.stringify(form) });
      toastSuccess("โพสต์ข่าวสำเร็จ");
      setShowForm(false);
      setForm({ title: "", content: "", imageUrl: "", isPinned: false });
      fetchData();
    } catch {
      toastError("โพสต์ข่าวไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Newspaper size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">ข่าวประชาสัมพันธ์</h1>
            <p className="text-xs text-on-surface-variant">พบ {total} รายการ</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> โพสต์ข่าว
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-on-surface-variant">กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <Newspaper size={40} className="mx-auto mb-3 opacity-30" />
          <p>ยังไม่มีข่าวประชาสัมพันธ์</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-5 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelected(item)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {item.isPinned && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                        <Pin size={10} /> ปักหมุด
                      </span>
                    )}
                    <span className="text-xs text-on-surface-variant">{formatThaiDateShort(item.publishedAt ?? item.createdAt)}</span>
                    <span className="text-xs text-on-surface-variant">โดย {item.author?.fullName ?? "—"}</span>
                  </div>
                  <h3 className="font-bold text-base text-on-surface mb-2 line-clamp-1">{item.title}</h3>
                  <p className="text-sm text-on-surface-variant line-clamp-3 leading-relaxed">{item.content}</p>
                </div>
                {item.imageUrl && (
                  <img src={item.imageUrl} alt={item.title} className="w-24 h-20 object-cover rounded-xl shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-outline-variant/10">
                <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <Eye size={12} /> {item.viewCount} views
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-lowest rounded-2xl w-full max-w-2xl shadow-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-on-surface-variant">{formatThaiDateShort(selected.publishedAt ?? selected.createdAt)} · {selected.author?.fullName}</span>
              <button onClick={() => setSelected(null)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            <h2 className="text-xl font-bold text-on-surface mb-3">{selected.title}</h2>
            {selected.imageUrl && <img src={selected.imageUrl} alt={selected.title} className="w-full h-48 object-cover rounded-xl mb-4" />}
            <div className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">{selected.content}</div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-lowest rounded-2xl w-full max-w-xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-primary">โพสต์ข่าวใหม่</h2>
              <button onClick={() => setShowForm(false)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">หัวข้อ *</label>
                <input className="input-text w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">เนื้อหา *</label>
                <textarea className="input-text w-full h-32 resize-none" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">URL รูปภาพ</label>
                <input className="input-text w-full" placeholder="https://..." value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isPinned} onChange={(e) => setForm({ ...form, isPinned: e.target.checked })} />
                <span className="text-sm text-on-surface-variant">ปักหมุดข่าว</span>
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">ยกเลิก</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? "กำลังโพสต์..." : "โพสต์ข่าว"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
