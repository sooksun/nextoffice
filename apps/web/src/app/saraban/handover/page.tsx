"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { getUser, AuthUser } from "@/lib/auth";
import { formatThaiDateShort, toThaiNumerals } from "@/lib/thai-date";
import { Archive, Plus, CheckCircle, FileCheck, Printer } from "lucide-react";

interface HandoverItem {
  id: number;
  handoverNo: string;
  handoverDate: string;
  recipientOrg: string;
  recipientName: string;
  description: string | null;
  status: string;
  itemCount: number;
  createdByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface EligibleDoc {
  id: number;
  registryNo: string | null;
  documentNo: string | null;
  subject: string | null;
  documentDate: string | null;
  fromOrg: string | null;
  retentionEndDate: string | null;
  folderName: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  approved: "อนุมัติแล้ว",
  completed: "ส่งมอบแล้ว",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
};

export default function HandoverPage() {
  const [records, setRecords] = useState<HandoverItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [eligible, setEligible] = useState<EligibleDoc[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [form, setForm] = useState({ recipientOrg: "หอจดหมายเหตุแห่งชาติ", recipientName: "", description: "" });
  const [user, setUser] = useState<AuthUser | null>(null);

  const loadData = async () => {
    try {
      const data = await apiFetch<HandoverItem[]>("/handover");
      setRecords(data);
    } catch { /* ignore */ }
  };

  const loadEligible = async () => {
    try {
      const data = await apiFetch<EligibleDoc[]>("/handover/eligible-documents");
      setEligible(data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const u = getUser();
    setUser(u);
    loadData();
  }, []);

  const handleShowForm = () => {
    setShowForm(true);
    loadEligible();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!form.recipientName || !selectedIds.length) return toastError("กรุณากรอกข้อมูลและเลือกเอกสาร");
    try {
      await apiFetch("/handover", {
        method: "POST",
        body: JSON.stringify({
          recipientOrg: form.recipientOrg,
          recipientName: form.recipientName,
          description: form.description || undefined,
          registryIds: selectedIds,
        }),
      });
      toastSuccess("สร้างบัญชีส่งมอบสำเร็จ");
      setShowForm(false);
      setSelectedIds([]);
      setForm({ recipientOrg: "หอจดหมายเหตุแห่งชาติ", recipientName: "", description: "" });
      loadData();
    } catch { toastError("เกิดข้อผิดพลาด"); }
  };

  const handleApprove = async (id: number) => {
    try {
      await apiFetch(`/handover/${id}/approve`, { method: "POST" });
      toastSuccess("อนุมัติแล้ว");
      loadData();
    } catch { toastError("เกิดข้อผิดพลาด"); }
  };

  const handleComplete = async (id: number) => {
    try {
      await apiFetch(`/handover/${id}/complete`, { method: "POST" });
      toastSuccess("บันทึกส่งมอบแล้ว");
      loadData();
    } catch { toastError("เกิดข้อผิดพลาด"); }
  };

  const openPdf = (id: number) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
    window.open(`${apiBase}/handover/${id}/pdf?token=${token}`, "_blank");
  };

  const canApprove = user?.roleCode === "DIRECTOR" || user?.roleCode === "ADMIN";

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Archive className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">บัญชีส่งมอบหนังสือครบ 20 ปี</h1>
        </div>
        <button
          onClick={handleShowForm}
          className="flex items-center gap-1 px-4 py-2 bg-primary text-white rounded-xl text-sm hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> สร้างบัญชีส่งมอบ
        </button>
      </div>

      {showForm && (
        <div className="bg-surface-bright border rounded-2xl p-4 space-y-4">
          <h2 className="font-semibold">สร้างบัญชีส่งมอบ</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              placeholder="หน่วยงานผู้รับมอบ"
              className="border rounded-xl px-3 py-2 text-sm"
              value={form.recipientOrg}
              onChange={(e) => setForm({ ...form, recipientOrg: e.target.value })}
            />
            <input
              placeholder="ชื่อผู้รับมอบ"
              className="border rounded-xl px-3 py-2 text-sm"
              value={form.recipientName}
              onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
            />
            <input
              placeholder="รายละเอียด/หมายเหตุ"
              className="border rounded-xl px-3 py-2 text-sm"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">เอกสารที่ครบกำหนดเก็บรักษา ({toThaiNumerals(eligible.length)} รายการ)</h3>
            {eligible.length === 0 ? (
              <p className="text-sm text-gray-400">ไม่มีเอกสารที่ครบกำหนด</p>
            ) : (
              <div className="max-h-64 overflow-y-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left w-8"></th>
                      <th className="px-2 py-1.5 text-left">ทะเบียน</th>
                      <th className="px-2 py-1.5 text-left">เลขที่</th>
                      <th className="px-2 py-1.5 text-left">เรื่อง</th>
                      <th className="px-2 py-1.5 text-left">ครบกำหนด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {eligible.map((doc) => (
                      <tr key={doc.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleSelect(doc.id)}>
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={selectedIds.includes(doc.id)} readOnly />
                        </td>
                        <td className="px-2 py-1.5">{doc.registryNo ? toThaiNumerals(doc.registryNo) : "-"}</td>
                        <td className="px-2 py-1.5">{doc.documentNo ? toThaiNumerals(doc.documentNo) : "-"}</td>
                        <td className="px-2 py-1.5">{doc.subject || "-"}</td>
                        <td className="px-2 py-1.5">{doc.retentionEndDate ? formatThaiDateShort(doc.retentionEndDate) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">เลือกแล้ว {toThaiNumerals(selectedIds.length)} รายการ</p>
          </div>

          <button onClick={handleCreate} className="px-4 py-2 bg-primary text-white rounded-xl text-sm hover:opacity-90">
            สร้างบัญชี
          </button>
        </div>
      )}

      <div className="bg-surface-bright border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">เลขที่</th>
              <th className="px-3 py-2 text-left">วันที่</th>
              <th className="px-3 py-2 text-left">ผู้รับมอบ</th>
              <th className="px-3 py-2 text-left">จำนวน</th>
              <th className="px-3 py-2 text-left">ผู้สร้าง</th>
              <th className="px-3 py-2 text-left">สถานะ</th>
              <th className="px-3 py-2 text-left">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono">{toThaiNumerals(r.handoverNo)}</td>
                <td className="px-3 py-2">{formatThaiDateShort(r.handoverDate)}</td>
                <td className="px-3 py-2">
                  <div>{r.recipientOrg}</div>
                  <div className="text-xs text-gray-500">{r.recipientName}</div>
                </td>
                <td className="px-3 py-2">{toThaiNumerals(r.itemCount)} รายการ</td>
                <td className="px-3 py-2">{r.createdByName}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[r.status] || "bg-gray-100"}`}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                </td>
                <td className="px-3 py-2 space-x-1">
                  {r.status === "draft" && canApprove && (
                    <button onClick={() => handleApprove(r.id)} className="text-blue-600 hover:underline text-xs">
                      <CheckCircle className="w-4 h-4 inline" /> อนุมัติ
                    </button>
                  )}
                  {r.status === "approved" && (
                    <button onClick={() => handleComplete(r.id)} className="text-green-600 hover:underline text-xs">
                      <FileCheck className="w-4 h-4 inline" /> ส่งมอบแล้ว
                    </button>
                  )}
                  <button onClick={() => openPdf(r.id)} className="text-blue-600 hover:underline text-xs">
                    <Printer className="w-4 h-4 inline" /> PDF
                  </button>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">ยังไม่มีบัญชีส่งมอบ</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
