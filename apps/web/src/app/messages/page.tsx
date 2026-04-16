"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatThaiDateShort } from "@/lib/thai-date";
import { MessageCircle, Send, X, Inbox, SendHorizonal } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";

interface Message {
  id: number;
  subject: string | null;
  content: string;
  isRead: boolean;
  createdAt: string;
  sender: { id: number; fullName: string } | null;
  receiver: { id: number; fullName: string } | null;
}

export default function MessagesPage() {
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [items, setItems] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState({ receiverUserId: "", subject: "", content: "" });
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const endpoint = tab === "inbox" ? "/messages/inbox" : "/messages/sent";
      const res = await apiFetch<{ total: number; data: Message[] }>(endpoint);
      setItems(res.data);
      setTotal(res.total);
    } catch {
      toastError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [tab]);

  async function openMessage(msg: Message) {
    setSelected(msg);
    if (!msg.isRead && tab === "inbox") {
      try {
        await apiFetch(`/messages/${msg.id}/read`, { method: "POST" });
        setItems((prev) => prev.map((m) => m.id === msg.id ? { ...m, isRead: true } : m));
      } catch { /* silent */ }
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!form.receiverUserId || !form.content) {
      toastError("กรุณากรอก ID ผู้รับและเนื้อหา");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/messages", {
        method: "POST",
        body: JSON.stringify({ ...form, receiverUserId: Number(form.receiverUserId) }),
      });
      toastSuccess("ส่งข้อความสำเร็จ");
      setShowCompose(false);
      setForm({ receiverUserId: "", subject: "", content: "" });
      if (tab === "sent") fetchData();
    } catch {
      toastError("ส่งข้อความไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const unreadCount = items.filter((m) => !m.isRead && tab === "inbox").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageCircle size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">ข้อความส่วนตัว</h1>
            <p className="text-xs text-on-surface-variant">
              {tab === "inbox" ? `กล่องขาเข้า — ${total} ข้อความ${unreadCount > 0 ? ` (${unreadCount} ยังไม่ได้อ่าน)` : ""}` : `ข้อความที่ส่ง — ${total} ข้อความ`}
            </p>
          </div>
        </div>
        <button onClick={() => setShowCompose(true)} className="btn-primary flex items-center gap-2">
          <Send size={16} /> เขียนข้อความ
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab("inbox")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === "inbox" ? "bg-primary text-white" : "btn-ghost"}`}
        >
          <Inbox size={14} /> กล่องขาเข้า
          {unreadCount > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{unreadCount}</span>}
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === "sent" ? "bg-primary text-white" : "btn-ghost"}`}
        >
          <SendHorizonal size={14} /> ที่ส่ง
        </button>
      </div>

      {/* Message List */}
      {loading ? (
        <div className="text-center py-10 text-on-surface-variant">กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <MessageCircle size={40} className="mx-auto mb-3 opacity-30" />
          <p>{tab === "inbox" ? "ไม่มีข้อความใน inbox" : "ยังไม่มีข้อความที่ส่ง"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md ${!msg.isRead && tab === "inbox" ? "border-primary/30 bg-primary/5" : "border-outline-variant/20 bg-surface-lowest"}`}
              onClick={() => openMessage(msg)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {!msg.isRead && tab === "inbox" && (
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    )}
                    <span className="text-xs text-on-surface-variant">
                      {tab === "inbox" ? `จาก: ${msg.sender?.fullName ?? "—"}` : `ถึง: ${msg.receiver?.fullName ?? "—"}`}
                    </span>
                  </div>
                  <p className={`text-sm line-clamp-1 ${!msg.isRead && tab === "inbox" ? "font-bold text-on-surface" : "text-on-surface"}`}>
                    {msg.subject ?? "(ไม่มีหัวข้อ)"}
                  </p>
                  <p className="text-xs text-on-surface-variant line-clamp-1 mt-0.5">{msg.content}</p>
                </div>
                <span className="text-xs text-on-surface-variant shrink-0 whitespace-nowrap">
                  {formatThaiDateShort(msg.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Message Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-lowest rounded-2xl w-full max-w-xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-on-surface-variant">
                  จาก: {selected.sender?.fullName ?? "—"} → ถึง: {selected.receiver?.fullName ?? "—"}
                </p>
                <p className="text-xs text-on-surface-variant">{formatThaiDateShort(selected.createdAt)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            {selected.subject && <h2 className="font-bold text-base text-on-surface mb-3">{selected.subject}</h2>}
            <div className="bg-surface-bright rounded-xl p-4">
              <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{selected.content}</p>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => {
                  setSelected(null);
                  setForm({ receiverUserId: String(selected.sender?.id ?? ""), subject: `Re: ${selected.subject ?? ""}`, content: "" });
                  setShowCompose(true);
                }}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <Send size={14} /> ตอบกลับ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-lowest rounded-2xl w-full max-w-xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-primary">เขียนข้อความใหม่</h2>
              <button onClick={() => setShowCompose(false)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">ID ผู้รับ *</label>
                <input
                  type="number"
                  className="input-text w-full"
                  placeholder="User ID"
                  value={form.receiverUserId}
                  onChange={(e) => setForm({ ...form, receiverUserId: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">หัวข้อ</label>
                <input className="input-text w-full" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">เนื้อหา *</label>
                <textarea className="input-text w-full h-32 resize-none" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCompose(false)} className="btn-ghost">ยกเลิก</button>
                <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving}>
                  <Send size={14} />
                  {saving ? "กำลังส่ง..." : "ส่งข้อความ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
