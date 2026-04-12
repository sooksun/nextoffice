"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { MessageCircle, Link2, Unlink, Key, Copy, X, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toThaiNumerals } from "@/lib/thai-date";

interface UserLine {
  id: number;
  fullName: string;
  email: string;
  roleCode: string;
  positionTitle: string | null;
  lineConnected: boolean;
  lineDisplayName: string | null;
  linePictureUrl: string | null;
  lastPairingCode: string | null;
  lastPairingExpiry: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  DIRECTOR: "ผอ.",
  VICE_DIRECTOR: "รอง ผอ.",
  HEAD_TEACHER: "หัวหน้า",
  TEACHER: "ครู",
  CLERK: "ธุรการ",
  ADMIN: "ผู้ดูแลระบบ",
};

const ROLE_COLOR: Record<string, string> = {
  DIRECTOR: "bg-violet-100 text-violet-800",
  VICE_DIRECTOR: "bg-blue-100 text-blue-800",
  HEAD_TEACHER: "bg-teal-100 text-teal-800",
  TEACHER: "bg-green-100 text-green-800",
  CLERK: "bg-orange-100 text-orange-800",
  ADMIN: "bg-red-100 text-red-800",
};

export default function LineAccountsPage() {
  const [users, setUsers] = useState<UserLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairingModal, setPairingModal] = useState<{ userId: number; fullName: string; code?: string; expiry?: string } | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [unlinking, setUnlinking] = useState<number | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    apiFetch<UserLine[]>("/staff-config/line-status")
      .then(setUsers)
      .catch(() => toast.error("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleGenerateCode = async (userId: number, fullName: string) => {
    setGeneratingCode(true);
    try {
      const res = await apiFetch<{ code: string; expiresAt: string }>(
        `/auth/users/${userId}/pairing-code`,
        { method: "POST" },
      );
      setPairingModal({ userId, fullName, code: res.code, expiry: res.expiresAt });
    } catch (e: any) {
      toast.error(e.message ?? "ไม่สามารถสร้างรหัสได้");
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleUnlink = async (userId: number) => {
    if (!confirm("ยืนยันยกเลิกการเชื่อมต่อ LINE ของผู้ใช้นี้?")) return;
    setUnlinking(userId);
    try {
      await apiFetch(`/staff-config/${userId}/line-unlink`, { method: "POST" });
      toast.success("ยกเลิกการเชื่อมต่อ LINE สำเร็จ");
      fetchData();
    } catch (e: any) {
      toast.error(e.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setUnlinking(null);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("คัดลอกรหัสแล้ว");
  };

  const connectedCount = users.filter((u) => u.lineConnected).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
          <MessageCircle size={20} className="text-green-700" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">จัดการเชื่อมต่อ LINE</h1>
          <p className="text-xs text-on-surface-variant">
            เชื่อมต่อแล้ว {toThaiNumerals(connectedCount)}/{toThaiNumerals(users.length)} คน
          </p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left w-10">#</th>
                <th className="px-4 py-3 text-left">ชื่อ - สกุล</th>
                <th className="px-4 py-3 text-left">ตำแหน่ง</th>
                <th className="px-4 py-3 text-center">สถานะ LINE</th>
                <th className="px-4 py-3 text-left">LINE Name</th>
                <th className="px-4 py-3 text-left">รหัสผูกบัญชี</th>
                <th className="px-4 py-3 text-center">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                    ไม่พบบุคลากร
                  </td>
                </tr>
              )}
              {users.map((u, i) => (
                <tr key={u.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                  <td className="px-4 py-3 text-on-surface-variant">{toThaiNumerals(i + 1)}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-on-surface">{u.fullName}</p>
                      <p className="text-xs text-on-surface-variant">{u.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${ROLE_COLOR[u.roleCode] ?? "bg-gray-100 text-gray-800"}`}>
                      {ROLE_LABEL[u.roleCode] ?? u.roleCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.lineConnected ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 font-semibold">
                        <CheckCircle size={14} />
                        เชื่อมต่อแล้ว
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
                        <XCircle size={14} />
                        ยังไม่เชื่อมต่อ
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.lineConnected && u.lineDisplayName ? (
                      <div className="flex items-center gap-2">
                        {u.linePictureUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.linePictureUrl} alt="" className="w-6 h-6 rounded-full" />
                        )}
                        <span className="text-xs font-medium">{u.lineDisplayName}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.lastPairingCode ? (
                      <div className="flex items-center gap-1">
                        <code className="bg-yellow-50 text-yellow-800 px-2 py-0.5 rounded text-xs font-bold tracking-widest">
                          {u.lastPairingCode}
                        </code>
                        <button onClick={() => copyCode(u.lastPairingCode!)} className="p-0.5 hover:bg-surface-bright rounded">
                          <Copy size={12} className="text-on-surface-variant" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {u.lineConnected ? (
                        <button
                          onClick={() => handleUnlink(u.id)}
                          disabled={unlinking === u.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {unlinking === u.id ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
                          ยกเลิก
                        </button>
                      ) : (
                        <button
                          onClick={() => handleGenerateCode(u.id, u.fullName)}
                          disabled={generatingCode}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {generatingCode ? <Loader2 size={12} className="animate-spin" /> : <Key size={12} />}
                          สร้างรหัส
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pairing Code Modal */}
      {pairingModal?.code && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPairingModal(null)}>
          <div className="bg-surface-lowest rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-on-surface">รหัสผูกบัญชี LINE</h3>
              <button onClick={() => setPairingModal(null)} className="p-1 hover:bg-surface-bright rounded-lg">
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-on-surface-variant mb-4">
              สำหรับ <strong>{pairingModal.fullName}</strong>
            </p>

            <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-6 text-center mb-4">
              <p className="text-xs text-on-surface-variant mb-2">พิมพ์ใน LINE Bot:</p>
              <p className="text-sm text-on-surface-variant mb-1">ผูกบัญชี</p>
              <p className="text-3xl font-black text-primary tracking-[0.3em] font-mono">
                {pairingModal.code}
              </p>
            </div>

            <button
              onClick={() => copyCode(`ผูกบัญชี ${pairingModal.code!}`)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold transition-transform active:scale-95"
            >
              <Copy size={14} />
              คัดลอกคำสั่ง
            </button>

            <p className="text-xs text-on-surface-variant text-center mt-3">
              รหัสหมดอายุใน {toThaiNumerals(24)} ชั่วโมง
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
