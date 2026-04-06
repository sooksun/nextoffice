"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError, toastWarning } from "@/lib/toast";
import { UserPlus, X } from "lucide-react";

interface Props {
  caseId: number;
  status: string;
}

interface StaffMember {
  id: number;
  fullName: string;
  roleCode: string;
  department: string | null;
}

export default function AssignButton({ caseId, status }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [directorNote, setDirectorNote] = useState("");

  if (!["registered", "assigned"].includes(status)) return null;

  const loadStaff = async () => {
    try {
      const res = await apiFetch<StaffMember[]>("/auth/users");
      setStaff(Array.isArray(res) ? res : []);
    } catch {
      setStaff([]);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    loadStaff();
  };

  const toggleUser = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    if (selected.size === 0) { toastWarning("กรุณาเลือกผู้รับผิดชอบ"); return; }
    setLoading(true);
    try {
      const assignments = Array.from(selected).map((userId) => ({
        userId,
        role: "responsible",
      }));
      await apiFetch(`/cases/${caseId}/assign`, {
        method: "POST",
        body: JSON.stringify({ assignments, directorNote: directorNote || undefined }),
      });
      toastSuccess("มอบหมายงานสำเร็จ");
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      toastError(err.message || "มอบหมายไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-on-secondary rounded-xl text-sm font-bold shadow-md transition-transform active:scale-95"
      >
        <UserPlus size={16} />
        มอบหมายงาน
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-surface-lowest rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
              <h3 className="text-lg font-bold text-on-surface">มอบหมายงาน</h3>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-surface-bright rounded-lg"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant mb-2 block">เลือกผู้รับผิดชอบ</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {staff.length === 0 && <p className="text-sm text-on-surface-variant">กำลังโหลด...</p>}
                  {staff.map((s) => (
                    <label key={s.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-bright cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleUser(s.id)}
                        className="w-4 h-4 rounded border-outline-variant"
                      />
                      <div>
                        <p className="text-sm font-medium">{s.fullName}</p>
                        <p className="text-xs text-on-surface-variant">{s.department || s.roleCode}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant mb-2 block">คำสั่งผู้บริหาร</label>
                <textarea
                  value={directorNote}
                  onChange={(e) => setDirectorNote(e.target.value)}
                  placeholder="หมายเหตุหรือคำสั่ง..."
                  className="w-full p-3 rounded-xl border border-outline-variant/20 bg-surface-bright text-sm resize-none"
                  rows={3}
                />
              </div>
            </div>
            <div className="p-5 border-t border-outline-variant/20 flex gap-3 justify-end">
              <button onClick={() => setOpen(false)} className="btn-ghost">ยกเลิก</button>
              <button
                onClick={handleAssign}
                disabled={loading || selected.size === 0}
                className="btn-primary disabled:opacity-50"
              >
                {loading ? "กำลังมอบหมาย..." : `มอบหมาย (${selected.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
