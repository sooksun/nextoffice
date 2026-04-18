"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { getUser } from "@/lib/auth";
import { formatThaiDateShort, toThaiNumerals } from "@/lib/thai-date";
import { Send, Plus, CheckCircle, Printer } from "lucide-react";

interface DispatchItem {
  id: number;
  dispatchNo: string;
  dispatchDate: string;
  recipientOrg: string;
  recipientName: string | null;
  deliveryMethod: string;
  status: string;
  receivedBy: string | null;
  receivedAt: string | null;
  remarks: string | null;
  registrySubject: string | null;
  registryDocNo: string | null;
  sentByName: string | null;
  createdAt: string;
}

interface RegistryOption {
  id: number;
  documentNo: string | null;
  subject: string | null;
  registryNo: string | null;
  toOrg: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  messenger: "ส่งด้วยเจ้าหน้าที่",
  post: "ส่งทางไปรษณีย์",
  pickup: "มารับเอง",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "รอส่ง",
  delivered: "ส่งแล้ว",
  returned: "ตีกลับ",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  delivered: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300",
  returned: "bg-red-500/20 text-red-800 dark:text-red-300",
};

export default function DispatchPage() {
  const [items, setItems] = useState<DispatchItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [registryOptions, setRegistryOptions] = useState<RegistryOption[]>([]);
  const [form, setForm] = useState({ registryId: 0, recipientOrg: "", recipientName: "", deliveryMethod: "messenger", remarks: "" });
  const [deliverModal, setDeliverModal] = useState<{ id: number; receivedBy: string } | null>(null);

  const loadData = async () => {
    try {
      const data = await apiFetch<DispatchItem[]>("/dispatch");
      setItems(data);
    } catch { /* ignore */ }
  };

  const loadRegistryOptions = async () => {
    try {
      const user = getUser();
      const orgId = (user as any)?.organizationId || 1;
      const res = await apiFetch<{ data: RegistryOption[] }>(`/reports/${orgId}/summary`);
      // fallback: load from outbound registry
      const outbound = await apiFetch<{ data: RegistryOption[] }>(`/saraban/outbound-registry?organizationId=${orgId}`).catch(() => ({ data: [] }));
      setRegistryOptions(outbound.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async () => {
    if (!form.registryId || !form.recipientOrg) return toastError("กรุณากรอกข้อมูลให้ครบ");
    try {
      await apiFetch("/dispatch", {
        method: "POST",
        body: JSON.stringify({
          registryId: form.registryId,
          recipientOrg: form.recipientOrg,
          recipientName: form.recipientName || undefined,
          deliveryMethod: form.deliveryMethod,
          remarks: form.remarks || undefined,
        }),
      });
      toastSuccess("สร้างรายการส่งสำเร็จ");
      setShowForm(false);
      setForm({ registryId: 0, recipientOrg: "", recipientName: "", deliveryMethod: "messenger", remarks: "" });
      loadData();
    } catch { toastError("เกิดข้อผิดพลาด"); }
  };

  const handleDeliver = async () => {
    if (!deliverModal) return;
    try {
      await apiFetch(`/dispatch/${deliverModal.id}/deliver`, {
        method: "POST",
        body: JSON.stringify({ receivedBy: deliverModal.receivedBy }),
      });
      toastSuccess("บันทึกการรับแล้ว");
      setDeliverModal(null);
      loadData();
    } catch { toastError("เกิดข้อผิดพลาด"); }
  };

  const openReceiptPdf = (id: number) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
    window.open(`${apiBase}/dispatch/${id}/receipt-pdf?token=${token}`, "_blank");
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">สมุดส่ง / ใบรับหนังสือ</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-4 py-2 bg-primary text-white rounded-xl text-sm hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> สร้างรายการส่ง
        </button>
      </div>

      {showForm && (
        <div className="bg-surface-bright border rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold">สร้างรายการส่งหนังสือ</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="number"
              placeholder="Registry ID (ทะเบียนเลขที่)"
              className="border rounded-xl px-3 py-2 text-sm"
              value={form.registryId || ""}
              onChange={(e) => setForm({ ...form, registryId: Number(e.target.value) })}
            />
            <input
              placeholder="หน่วยงานผู้รับ"
              className="border rounded-xl px-3 py-2 text-sm"
              value={form.recipientOrg}
              onChange={(e) => setForm({ ...form, recipientOrg: e.target.value })}
            />
            <input
              placeholder="ชื่อผู้รับ (ถ้ามี)"
              className="border rounded-xl px-3 py-2 text-sm"
              value={form.recipientName}
              onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
            />
            <select
              className="border rounded-xl px-3 py-2 text-sm"
              value={form.deliveryMethod}
              onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value })}
            >
              <option value="messenger">ส่งด้วยเจ้าหน้าที่</option>
              <option value="post">ส่งทางไปรษณีย์</option>
              <option value="pickup">มารับเอง</option>
            </select>
          </div>
          <input
            placeholder="หมายเหตุ"
            className="border rounded-xl px-3 py-2 text-sm w-full"
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          />
          <button onClick={handleCreate} className="px-4 py-2 bg-primary text-white rounded-xl text-sm hover:opacity-90">
            บันทึก
          </button>
        </div>
      )}

      <div className="bg-surface-bright border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-low text-on-surface-variant">
            <tr>
              <th className="px-3 py-2 text-left">เลขที่ส่ง</th>
              <th className="px-3 py-2 text-left">วันที่ส่ง</th>
              <th className="px-3 py-2 text-left">เอกสาร</th>
              <th className="px-3 py-2 text-left">ผู้รับ</th>
              <th className="px-3 py-2 text-left">วิธี</th>
              <th className="px-3 py-2 text-left">สถานะ</th>
              <th className="px-3 py-2 text-left">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((d) => (
              <tr key={d.id} className="hover:bg-surface-low">
                <td className="px-3 py-2 font-mono">{toThaiNumerals(d.dispatchNo)}</td>
                <td className="px-3 py-2">{formatThaiDateShort(d.dispatchDate)}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{d.registrySubject || "-"}</div>
                  <div className="text-xs text-on-surface-variant">{d.registryDocNo ? toThaiNumerals(d.registryDocNo) : ""}</div>
                </td>
                <td className="px-3 py-2">{d.recipientOrg}</td>
                <td className="px-3 py-2">{METHOD_LABEL[d.deliveryMethod] || d.deliveryMethod}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[d.status] || "bg-surface-mid"}`}>
                    {STATUS_LABEL[d.status] || d.status}
                  </span>
                </td>
                <td className="px-3 py-2 space-x-1">
                  {d.status === "pending" && (
                    <button
                      onClick={() => setDeliverModal({ id: d.id, receivedBy: "" })}
                      className="text-green-600 hover:underline text-xs"
                    >
                      <CheckCircle className="w-4 h-4 inline" /> ส่งแล้ว
                    </button>
                  )}
                  <button
                    onClick={() => openReceiptPdf(d.id)}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    <Printer className="w-4 h-4 inline" /> ใบรับ
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-on-surface-variant/70">ยังไม่มีรายการส่ง</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {deliverModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-surface-bright rounded-2xl p-6 w-96 space-y-3">
            <h3 className="font-semibold">บันทึกการรับหนังสือ</h3>
            <input
              placeholder="ชื่อผู้รับ"
              className="border rounded-xl px-3 py-2 text-sm w-full"
              value={deliverModal.receivedBy}
              onChange={(e) => setDeliverModal({ ...deliverModal, receivedBy: e.target.value })}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeliverModal(null)} className="px-3 py-1.5 text-sm border rounded-xl">ยกเลิก</button>
              <button onClick={handleDeliver} className="px-3 py-1.5 text-sm bg-primary text-white rounded-xl">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
