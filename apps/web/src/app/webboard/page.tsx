"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatThaiDateShort } from "@/lib/thai-date";
import { Globe, Plus, X, MessageSquare, Eye } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";

const CATEGORY_LABEL: Record<string, string> = {
  general: "ทั่วไป",
  announcement: "ประกาศ",
  question: "คำถาม",
  discuss: "ถกเถียง",
};

interface WebboardThread {
  id: number;
  category: string;
  title: string;
  content: string;
  isPinned: boolean;
  isClosed: boolean;
  viewCount: number;
  replyCount: number;
  lastReplyAt: string | null;
  createdAt: string;
  author: { id: number; fullName: string } | null;
}

interface WebboardReply {
  id: number;
  content: string;
  createdAt: string;
  author: { id: number; fullName: string } | null;
}

interface ThreadDetail extends WebboardThread {
  replies: WebboardReply[];
}

export default function WebboardPage() {
  const [threads, setThreads] = useState<WebboardThread[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ThreadDetail | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", category: "general" });
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      const res = await apiFetch<{ total: number; data: WebboardThread[] }>(`/webboard/threads?${params}`);
      setThreads(res.data);
      setTotal(res.total);
    } catch {
      toastError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [category]);

  async function openThread(thread: WebboardThread) {
    try {
      const detail = await apiFetch<ThreadDetail>(`/webboard/threads/${thread.id}`);
      setSelected(detail);
    } catch {
      toastError("โหลดกระทู้ไม่สำเร็จ");
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyContent.trim() || !selected) return;
    setSendingReply(true);
    try {
      await apiFetch(`/webboard/threads/${selected.id}/replies`, {
        method: "POST",
        body: JSON.stringify({ content: replyContent }),
      });
      toastSuccess("ตอบกระทู้สำเร็จ");
      setReplyContent("");
      const detail = await apiFetch<ThreadDetail>(`/webboard/threads/${selected.id}`);
      setSelected(detail);
      fetchData();
    } catch {
      toastError("ตอบกระทู้ไม่สำเร็จ");
    } finally {
      setSendingReply(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.content) {
      toastError("กรุณากรอกหัวข้อและเนื้อหา");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/webboard/threads", { method: "POST", body: JSON.stringify(form) });
      toastSuccess("ตั้งกระทู้สำเร็จ");
      setShowForm(false);
      setForm({ title: "", content: "", category: "general" });
      fetchData();
    } catch {
      toastError("ตั้งกระทู้ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Globe size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">เว็บบอร์ด</h1>
            <p className="text-xs text-on-surface-variant">พบ {total} กระทู้</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> ตั้งกระทู้
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <select className="input-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">ทุกหมวดหมู่</option>
          {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-10 text-on-surface-variant">กำลังโหลด...</div>
      ) : threads.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <Globe size={40} className="mx-auto mb-3 opacity-30" />
          <p>ยังไม่มีกระทู้</p>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4 cursor-pointer hover:shadow-md transition-shadow flex items-start gap-4"
              onClick={() => openThread(thread)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    {CATEGORY_LABEL[thread.category] ?? thread.category}
                  </span>
                  {thread.isPinned && <span className="text-[10px] text-primary font-bold">📌</span>}
                  {thread.isClosed && <span className="text-[10px] text-red-600 font-bold">🔒 ปิดกระทู้</span>}
                </div>
                <h3 className="font-semibold text-sm text-on-surface line-clamp-1">{thread.title}</h3>
                <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{thread.content}</p>
                <p className="text-xs text-on-surface-variant mt-1">โดย {thread.author?.fullName ?? "—"} · {formatThaiDateShort(thread.createdAt)}</p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1 text-xs text-on-surface-variant">
                <span className="flex items-center gap-1"><MessageSquare size={11} /> {thread.replyCount}</span>
                <span className="flex items-center gap-1"><Eye size={11} /> {thread.viewCount}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Thread Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-lowest rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
              <div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                  {CATEGORY_LABEL[selected.category] ?? selected.category}
                </span>
                <h2 className="font-bold text-base text-on-surface mt-1">{selected.title}</h2>
                <p className="text-xs text-on-surface-variant">โดย {selected.author?.fullName} · {formatThaiDateShort(selected.createdAt)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="btn-ghost p-2 shrink-0"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Original post */}
              <div className="bg-surface-bright rounded-xl p-4">
                <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{selected.content}</p>
              </div>
              {/* Replies */}
              {selected.replies.map((r, i) => (
                <div key={r.id} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{i + 1}</div>
                  <div className="flex-1 bg-surface-bright rounded-xl p-3">
                    <p className="text-xs text-on-surface-variant mb-1">{r.author?.fullName} · {formatThaiDateShort(r.createdAt)}</p>
                    <p className="text-sm text-on-surface whitespace-pre-wrap">{r.content}</p>
                  </div>
                </div>
              ))}
            </div>
            {!selected.isClosed && (
              <form onSubmit={handleReply} className="p-4 border-t border-outline-variant/20 flex gap-3">
                <textarea
                  className="input-text flex-1 h-16 resize-none text-sm"
                  placeholder="ตอบกระทู้..."
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                />
                <button type="submit" className="btn-primary px-4 self-end" disabled={sendingReply}>ส่ง</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Create Thread Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-lowest rounded-2xl w-full max-w-xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-primary">ตั้งกระทู้ใหม่</h2>
              <button onClick={() => setShowForm(false)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">หมวดหมู่</label>
                <select className="input-select w-full" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">หัวข้อ *</label>
                <input className="input-text w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">เนื้อหา *</label>
                <textarea className="input-text w-full h-28 resize-none" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">ยกเลิก</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? "กำลังบันทึก..." : "ตั้งกระทู้"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
