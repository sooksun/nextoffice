"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatThaiDateShort } from "@/lib/thai-date";
import { FileText, Plus, X, Calendar } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";

const STATUS_LABEL: Record<string, string> = {
  open: "เปิดรับ",
  closed: "ปิดรับ",
  cancelled: "ยกเลิก",
  awarded: "คัดเลือกแล้ว",
};
const STATUS_COLOR: Record<string, string> = {
  open: "bg-green-100 text-green-800",
  closed: "bg-surface-bright text-on-surface-variant",
  cancelled: "bg-red-100 text-red-800",
  awarded: "bg-blue-100 text-blue-800",
};
const TENDER_TYPE_LABEL: Record<string, string> = {
  price_check: "สอบราคา",
  e_bidding: "ประกวดราคา (e-bidding)",
  specific: "วิธีเฉพาะเจาะจง",
  urgent: "กรณีเร่งด่วน",
};

interface TenderPost {
  id: number;
  title: string;
  content: string;
  budget: number | null;
  deadline: string | null;
  tenderType: string;
  status: string;
  fileUrl: string | null;
  createdAt: string;
  author: { id: number; fullName: string } | null;
}

export default function TenderPage() {
  const [items, setItems] = useState<TenderPost[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TenderPost | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    content: "",
    budget: "",
    deadline: "",
    tenderType: "price_check",
    fileUrl: "",
  });
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await apiFetch<{ total: number; data: TenderPost[] }>(`/tender?${params}`);
      setItems(res.data);
      setTotal(res.total);
    } catch {
      toastError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [statusFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.content) {
      toastError("กรุณากรอกข้อมูลที่จำเป็น");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/tender", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          budget: form.budget ? Number(form.budget) : undefined,
          deadline: form.deadline || undefined,
        }),
      });
      toastSuccess("โพสต์ประกาศสำเร็จ");
      setShowForm(false);
      setForm({ title: "", content: "", budget: "", deadline: "", tenderType: "price_check", fileUrl: "" });
      fetchData();
    } catch {
      toastError("โพสต์ประกาศไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">ข่าวประกวดราคา</h1>
            <p className="text-xs text-on-surface-variant">จัดซื้อจัดจ้าง — พบ {total} รายการ</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> ประกาศใหม่
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <select className="input-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-10 text-on-surface-variant">กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p>ยังไม่มีประกาศจัดซื้อจัดจ้าง</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-5 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelected(item)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold ${STATUS_COLOR[item.status] ?? STATUS_COLOR.open}`}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-bright text-on-surface-variant font-medium">
                      {TENDER_TYPE_LABEL[item.tenderType] ?? item.tenderType}
                    </span>
                  </div>
                  <h3 className="font-bold text-base text-on-surface mb-1 line-clamp-2">{item.title}</h3>
                  <p className="text-xs text-on-surface-variant line-clamp-2">{item.content}</p>
                </div>
                <div className="shrink-0 text-right">
                  {item.budget && (
                    <p className="font-bold text-primary text-sm">
                      {item.budget.toLocaleString()} บาท
                    </p>
                  )}
                  {item.deadline && (
                    <div className="flex items-center gap-1 text-xs text-on-surface-variant mt-1 justify-end">
                      <Calendar size={11} />
                      <span>ถึง {formatThaiDateShort(item.deadline)}</span>
                    </div>
                  )}
                </div>
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
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold ${STATUS_COLOR[selected.status] ?? STATUS_COLOR.open}`}>
                  {STATUS_LABEL[selected.status]}
                </span>
                <span className="text-xs text-on-surface-variant">{TENDER_TYPE_LABEL[selected.tenderType]}</span>
              </div>
              <button onClick={() => setSelected(null)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            <h2 className="text-xl font-bold text-on-surface mb-3">{selected.title}</h2>
            {selected.budget && <p className="text-primary font-bold mb-2">วงเงิน: {selected.budget.toLocaleString()} บาท</p>}
            {selected.deadline && <p className="text-sm text-on-surface-variant mb-3 flex items-center gap-1"><Calendar size={14} />กำหนดยื่น: {formatThaiDateShort(selected.deadline)}</p>}
            <div className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">{selected.content}</div>
            {selected.fileUrl && (
              <a href={selected.fileUrl} target="_blank" rel="noreferrer" className="btn-primary inline-flex items-center gap-2 mt-4">
                <FileText size={14} /> ดาวน์โหลดเอกสาร
              </a>
            )}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-lowest rounded-2xl w-full max-w-xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-primary">ประกาศจัดซื้อจัดจ้างใหม่</h2>
              <button onClick={() => setShowForm(false)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">ชื่อโครงการ *</label>
                <input className="input-text w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant mb-1 block">วิธีการจัดซื้อ</label>
                  <select className="input-select w-full" value={form.tenderType} onChange={(e) => setForm({ ...form, tenderType: e.target.value })}>
                    {Object.entries(TENDER_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant mb-1 block">วงเงิน (บาท)</label>
                  <input type="number" className="input-text w-full" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">วันสิ้นสุดรับข้อเสนอ</label>
                <input type="date" className="input-text w-full" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">รายละเอียด *</label>
                <textarea className="input-text w-full h-28 resize-none" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant mb-1 block">URL ไฟล์ประกาศ</label>
                <input className="input-text w-full" placeholder="https://..." value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">ยกเลิก</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? "กำลังโพสต์..." : "ประกาศ"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
