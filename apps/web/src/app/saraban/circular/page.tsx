"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatThaiDateShort } from "@/lib/thai-date";
import { Send, Plus, X } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  published: "เผยแพร่แล้ว",
  cancelled: "ยกเลิก",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-bright text-on-surface-variant",
  published: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};
const URGENCY_LABEL: Record<string, string> = {
  normal: "ปกติ",
  urgent: "ด่วน",
  very_urgent: "ด่วนมาก",
  most_urgent: "ด่วนที่สุด",
};

interface CircularDoc {
  id: number;
  circularNo: string;
  subject: string;
  urgencyLevel: string;
  status: string;
  issuedDate: string;
  createdAt: string;
  createdBy: { id: number; fullName: string } | null;
  circularRecipients: { id: number; recipientName: string }[];
}

export default function CircularPage() {
  const [items, setItems] = useState<CircularDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    circularNo: "",
    subject: "",
    body: "",
    urgencyLevel: "normal",
    issuedDate: new Date().toISOString().slice(0, 10),
    recipients: "",
  });
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: "100" });
      if (search) params.set("search", search);
      const res = await apiFetch<{ total: number; data: CircularDoc[] }>(`/circular?${params}`);
      setItems(res.data);
      setTotal(res.total);
    } catch {
      toastError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.circularNo || !form.subject || !form.issuedDate) {
      toastError("กรุณากรอกข้อมูลที่จำเป็น");
      return;
    }
    setSaving(true);
    try {
      const recipients = form.recipients
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean);
      await apiFetch("/circular", {
        method: "POST",
        body: JSON.stringify({ ...form, recipients }),
      });
      toastSuccess("ออกเลขหนังสือเวียนสำเร็จ");
      setShowForm(false);
      setForm({ circularNo: "", subject: "", body: "", urgencyLevel: "normal", issuedDate: new Date().toISOString().slice(0, 10), recipients: "" });
      fetchData();
    } catch {
      toastError("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Send size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">ออกเลขหนังสือเวียน</h1>
            <p className="text-xs text-on-surface-variant">พบ {total} รายการ</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> ออกเลขใหม่
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-5">
        <input
          type="text"
          placeholder="ค้นหาเลขที่ หรือ เรื่อง..."
          className="input-text flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchData()}
        />
        <button onClick={fetchData} className="btn-primary">ค้นหา</button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">เลขที่หนังสือเวียน</th>
              <th className="px-4 py-3 text-left">เรื่อง</th>
              <th className="px-4 py-3 text-left">ลงวันที่</th>
              <th className="px-4 py-3 text-left">ชั้นความเร็ว</th>
              <th className="px-4 py-3 text-left">ผู้รับ</th>
              <th className="px-4 py-3 text-center">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">กำลังโหลด...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">ไม่พบข้อมูล</td></tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{item.circularNo}</td>
                <td className="px-4 py-3 max-w-[280px]">
                  <span className="line-clamp-2 text-xs leading-relaxed">{item.subject}</span>
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                  {formatThaiDateShort(item.issuedDate)}
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">
                  {URGENCY_LABEL[item.urgencyLevel] ?? item.urgencyLevel}
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">
                  {item.circularRecipients.length > 0
                    ? item.circularRecipients.slice(0, 2).map((r) => r.recipientName).join(", ") +
                      (item.circularRecipients.length > 2 ? ` +${item.circularRecipients.length - 2}` : "")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold ${STATUS_COLOR[item.status] ?? STATUS_COLOR.published}`}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-lowest rounded-2xl w-full max-w-xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-primary">ออกเลขหนังสือเวียนใหม่</h2>
              <button onClick={() => setShowForm(false)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant mb-1 block">เลขที่ *</label>
                  <input className="input-text w-full" placeholder="ที่ สพม.xx/0001/2568" value={form.circularNo} onChange={(e) => setForm({ ...form, circularNo: e.target.value })} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant mb-1 block">ลงวันที่ *</label>
                  <input type="date" className="input-text w-full" value={form.issuedDate} onChange={(e) => setForm({ ...form, issuedDate: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">เรื่อง *</label>
                <input className="input-text w-full" placeholder="เรื่องหนังสือเวียน" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">ชั้นความเร็ว</label>
                <select className="input-select w-full" value={form.urgencyLevel} onChange={(e) => setForm({ ...form, urgencyLevel: e.target.value })}>
                  {Object.entries(URGENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">เนื้อหา</label>
                <textarea className="input-text w-full h-24 resize-none" placeholder="เนื้อหาหนังสือเวียน..." value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">ผู้รับ (แต่ละบรรทัดเป็นหน่วยงาน)</label>
                <textarea className="input-text w-full h-20 resize-none" placeholder="โรงเรียนบ้านตัวอย่าง&#10;โรงเรียนดีมาก" value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">ยกเลิก</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? "กำลังบันทึก..." : "ออกเลขหนังสือเวียน"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
