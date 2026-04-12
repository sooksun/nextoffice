"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { getUser } from "@/lib/auth";
import { formatThaiDateShort, toThaiNumerals } from "@/lib/thai-date";
import { BookOpen, Plus, RotateCcw, AlertTriangle } from "lucide-react";

interface LoanItem {
  id: number;
  loanNo: string;
  borrowDate: string;
  dueDate: string;
  returnDate: string | null;
  purpose: string | null;
  status: string;
  remarks: string | null;
  registrySubject: string | null;
  registryDocNo: string | null;
  borrowerName: string | null;
  approvedByName: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  active: "กำลังยืม",
  returned: "คืนแล้ว",
  overdue: "เกินกำหนด",
};
const STATUS_COLOR: Record<string, string> = {
  active: "bg-blue-100 text-blue-800",
  returned: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
};

export default function LoansPage() {
  const [items, setItems] = useState<LoanItem[]>([]);
  const [tab, setTab] = useState<string>("active");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ registryId: 0, dueDate: "", purpose: "" });

  const loadData = async () => {
    try {
      const status = tab === "all" ? undefined : tab;
      const data = await apiFetch<LoanItem[]>(`/loans${status ? `?status=${status}` : ""}`);
      setItems(data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadData();
  }, [tab]);

  const handleCreate = async () => {
    if (!form.registryId || !form.dueDate) return toastError("กรุณากรอกข้อมูลให้ครบ");
    const user = getUser();
    try {
      await apiFetch("/loans", {
        method: "POST",
        body: JSON.stringify({
          registryId: form.registryId,
          borrowerUserId: (user as any)?.id || 1,
          dueDate: form.dueDate,
          purpose: form.purpose || undefined,
        }),
      });
      toastSuccess("บันทึกการยืมสำเร็จ");
      setShowForm(false);
      setForm({ registryId: 0, dueDate: "", purpose: "" });
      loadData();
    } catch (e: any) {
      toastError(e?.message || "เกิดข้อผิดพลาด");
    }
  };

  const handleReturn = async (id: number) => {
    try {
      await apiFetch(`/loans/${id}/return`, { method: "POST" });
      toastSuccess("คืนเอกสารสำเร็จ");
      loadData();
    } catch { toastError("เกิดข้อผิดพลาด"); }
  };

  const tabs = [
    { key: "active", label: "กำลังยืม" },
    { key: "overdue", label: "เกินกำหนด" },
    { key: "returned", label: "คืนแล้ว" },
    { key: "all", label: "ทั้งหมด" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">ระบบยืม-คืนเอกสาร</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-4 py-2 bg-primary text-white rounded-xl text-sm hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> ยืมเอกสาร
        </button>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-xl text-sm ${tab === t.key ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="bg-surface-bright border rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold">ยืมเอกสาร</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="number"
              placeholder="Registry ID (ทะเบียนเลขที่)"
              className="border rounded-xl px-3 py-2 text-sm"
              value={form.registryId || ""}
              onChange={(e) => setForm({ ...form, registryId: Number(e.target.value) })}
            />
            <input
              type="date"
              className="border rounded-xl px-3 py-2 text-sm"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
            <input
              placeholder="วัตถุประสงค์"
              className="border rounded-xl px-3 py-2 text-sm"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
          </div>
          <button onClick={handleCreate} className="px-4 py-2 bg-primary text-white rounded-xl text-sm hover:opacity-90">
            บันทึก
          </button>
        </div>
      )}

      <div className="bg-surface-bright border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">เลขที่ยืม</th>
              <th className="px-3 py-2 text-left">เอกสาร</th>
              <th className="px-3 py-2 text-left">ผู้ยืม</th>
              <th className="px-3 py-2 text-left">วันที่ยืม</th>
              <th className="px-3 py-2 text-left">กำหนดคืน</th>
              <th className="px-3 py-2 text-left">สถานะ</th>
              <th className="px-3 py-2 text-left">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((l) => (
              <tr key={l.id} className={`hover:bg-gray-50 ${l.status === "overdue" ? "bg-red-50" : ""}`}>
                <td className="px-3 py-2 font-mono">{toThaiNumerals(l.loanNo)}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{l.registrySubject || "-"}</div>
                  <div className="text-xs text-gray-500">{l.registryDocNo ? toThaiNumerals(l.registryDocNo) : ""}</div>
                </td>
                <td className="px-3 py-2">{l.borrowerName}</td>
                <td className="px-3 py-2">{formatThaiDateShort(l.borrowDate)}</td>
                <td className="px-3 py-2">
                  {formatThaiDateShort(l.dueDate)}
                  {l.status === "overdue" && <AlertTriangle className="w-3 h-3 inline ml-1 text-red-500" />}
                </td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[l.status] || "bg-gray-100"}`}>
                    {STATUS_LABEL[l.status] || l.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {(l.status === "active" || l.status === "overdue") && (
                    <button
                      onClick={() => handleReturn(l.id)}
                      className="text-green-600 hover:underline text-xs flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> คืน
                    </button>
                  )}
                  {l.status === "returned" && l.returnDate && (
                    <span className="text-xs text-gray-500">คืน {formatThaiDateShort(l.returnDate)}</span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">ไม่มีรายการ</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
