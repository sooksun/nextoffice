"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError, toastWarning } from "@/lib/toast";
import { UserPlus, X, Calendar, CalendarOff, CalendarCheck } from "lucide-react";

interface Props {
  caseId: number;
  status: string;
  caseDueDate?: string | null;
}

interface StaffMember {
  id: number;
  fullName: string;
  roleCode: string;
  department: string | null;
}

type DueDateMode = "none" | "from_doc" | "custom";

/** แปลง ISO string → "YYYY-MM-DDThh:mm" สำหรับ datetime-local input */
function toLocalDatetimeValue(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

/** แสดงวันที่แบบไทย */
function formatDateThai(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function AssignButton({ caseId, status, caseDueDate }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [directorNote, setDirectorNote] = useState("");
  const [dueDateMode, setDueDateMode] = useState<DueDateMode>("none");
  const [customDueDate, setCustomDueDate] = useState(toLocalDatetimeValue(caseDueDate));

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
    setSelected(new Set());
    setDirectorNote("");
    setDueDateMode("none");
    setCustomDueDate(toLocalDatetimeValue(caseDueDate));
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

  /** คำนวณ dueDate ที่จะส่ง API */
  const resolvedDueDate = (): string | undefined => {
    if (dueDateMode === "none") return undefined;
    if (dueDateMode === "from_doc") return caseDueDate ?? undefined;
    if (dueDateMode === "custom" && customDueDate) return new Date(customDueDate).toISOString();
    return undefined;
  };

  const handleAssign = async () => {
    if (selected.size === 0) { toastWarning("กรุณาเลือกผู้รับผิดชอบ"); return; }
    if (dueDateMode === "custom" && !customDueDate) {
      toastWarning("กรุณาเลือกวันที่ดำเนินการ"); return;
    }
    setLoading(true);
    try {
      const dueDate = resolvedDueDate();
      const assignments = Array.from(selected).map((userId) => ({
        userId,
        role: "responsible",
        ...(dueDate ? { dueDate } : {}),
      }));
      await apiFetch(`/cases/${caseId}/assign`, {
        method: "POST",
        body: JSON.stringify({ assignments, directorNote: directorNote || undefined }),
      });
      toastSuccess("มอบหมายงานสำเร็จ" + (dueDate ? " — บันทึก Google Calendar แล้ว" : ""));
      setOpen(false);
      router.refresh();
    } catch (err: unknown) {
      toastError((err as Error).message || "มอบหมายไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const dueDateModeOptions: { value: DueDateMode; label: string; icon: React.ReactNode; desc?: string }[] = [
    {
      value: "none",
      label: "ไม่กำหนด",
      icon: <CalendarOff size={15} />,
      desc: "ไม่เพิ่มเข้า Google Calendar",
    },
    {
      value: "from_doc",
      label: "ใช้วันที่จากหนังสือ",
      icon: <CalendarCheck size={15} />,
      desc: caseDueDate ? formatDateThai(caseDueDate) : "ไม่พบวันที่ในหนังสือ",
    },
    {
      value: "custom",
      label: "เลือกวันที่เอง",
      icon: <Calendar size={15} />,
    },
  ];

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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-surface-lowest rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
              <h3 className="text-lg font-bold text-on-surface">มอบหมายงาน</h3>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-surface-bright rounded-lg">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Staff list */}
              <div>
                <label className="text-sm font-semibold text-on-surface-variant mb-2 block">
                  เลือกผู้รับผิดชอบ
                </label>
                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                  {staff.length === 0 && (
                    <p className="text-sm text-on-surface-variant py-3 text-center">กำลังโหลด...</p>
                  )}
                  {staff.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-bright cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleUser(s.id)}
                        className="w-4 h-4 rounded border-outline-variant"
                      />
                      <div>
                        <p className="text-sm font-medium">{s.fullName}</p>
                        <p className="text-xs text-on-surface-variant uppercase tracking-wide">
                          {s.department || s.roleCode}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Due date mode */}
              <div>
                <label className="text-sm font-semibold text-on-surface-variant mb-2 block flex items-center gap-1.5">
                  <Calendar size={14} />
                  วันที่ดำเนินการ
                  <span className="text-[11px] font-normal text-outline">(บันทึก Google Calendar)</span>
                </label>
                <div className="space-y-2">
                  {dueDateModeOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        dueDateMode === opt.value
                          ? "border-primary/40 bg-primary/5"
                          : "border-outline-variant/20 hover:bg-surface-bright"
                      } ${opt.value === "from_doc" && !caseDueDate ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <input
                        type="radio"
                        name="dueDateMode"
                        value={opt.value}
                        checked={dueDateMode === opt.value}
                        onChange={() => setDueDateMode(opt.value)}
                        disabled={opt.value === "from_doc" && !caseDueDate}
                        className="mt-0.5 accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-on-surface">
                          <span className={dueDateMode === opt.value ? "text-primary" : "text-on-surface-variant"}>
                            {opt.icon}
                          </span>
                          {opt.label}
                        </div>
                        {opt.desc && (
                          <p className="text-xs text-on-surface-variant mt-0.5">{opt.desc}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                {/* Custom datetime picker */}
                {dueDateMode === "custom" && (
                  <div className="mt-3">
                    <input
                      type="datetime-local"
                      value={customDueDate}
                      onChange={(e) => setCustomDueDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-bright text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {customDueDate && (
                      <p className="text-xs text-primary mt-1.5 flex items-center gap-1">
                        <Calendar size={11} />
                        {formatDateThai(new Date(customDueDate).toISOString())}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Director note */}
              <div>
                <label className="text-sm font-semibold text-on-surface-variant mb-2 block">
                  คำสั่งผู้บริหาร
                </label>
                <textarea
                  value={directorNote}
                  onChange={(e) => setDirectorNote(e.target.value)}
                  placeholder="หมายเหตุหรือคำสั่ง..."
                  className="w-full p-3 rounded-xl border border-outline-variant/20 bg-surface-bright text-sm resize-none"
                  rows={3}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-outline-variant/20 flex gap-3 justify-end">
              <button onClick={() => setOpen(false)} className="btn-ghost">
                ยกเลิก
              </button>
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
