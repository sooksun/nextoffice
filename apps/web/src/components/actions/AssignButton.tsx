"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError, toastWarning } from "@/lib/toast";
import { UserPlus, X, Calendar, CalendarOff, CalendarCheck, Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  caseId: number;
  status: string;
  caseDueDate?: string | null;
  nextActions?: string[];
}

interface StaffMember {
  id: number;
  fullName: string;
  roleCode: string;
  department: string | null;
}

type DueDateMode = "none" | "from_doc" | "custom";

// ---- Thai Buddhist Era helpers ----

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

interface ThaiDate {
  day: number;      // 1–31
  month: number;    // 1–12
  yearBE: number;   // พ.ศ. e.g. 2568
  hour: number;     // 0–23
  minute: number;   // 0–59
}

function isoToThaiDate(iso: string | null | undefined): ThaiDate {
  const d = iso ? new Date(iso) : new Date();
  return {
    day: d.getDate(),
    month: d.getMonth() + 1,
    yearBE: d.getFullYear() + 543,
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

function thaiDateToIso(td: ThaiDate): string {
  const yearCE = td.yearBE - 543;
  const d = new Date(yearCE, td.month - 1, td.day, td.hour, td.minute, 0);
  return d.toISOString();
}

function formatThaiDateDisplay(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const yearBE = d.getFullYear() + 543;
    const day = d.getDate();
    const month = THAI_MONTHS[d.getMonth()];
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const timeStr = (d.getHours() !== 0 || d.getMinutes() !== 0) ? ` เวลา ${h}:${m} น.` : "";
    return `${day} ${month} ${yearBE}${timeStr}`;
  } catch {
    return iso;
  }
}

// ---- Thai Date Picker component ----

function ThaiDateTimePicker({
  value,
  onChange,
}: {
  value: ThaiDate;
  onChange: (v: ThaiDate) => void;
}) {
  const daysInMonth = useMemo(() => {
    const yearCE = value.yearBE - 543;
    return new Date(yearCE, value.month, 0).getDate();
  }, [value.month, value.yearBE]);

  const set = (patch: Partial<ThaiDate>) => {
    const next = { ...value, ...patch };
    // clamp day to valid range
    const yearCE = next.yearBE - 543;
    const max = new Date(yearCE, next.month, 0).getDate();
    if (next.day > max) next.day = max;
    onChange(next);
  };

  const selectCls =
    "border border-outline-variant/30 rounded-lg bg-surface-bright text-sm px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="mt-3 space-y-3 p-3 bg-primary/5 rounded-xl border border-primary/20">
      {/* Row 1: Day Month Year */}
      <div className="flex gap-2 items-center flex-wrap">
        {/* Day */}
        <select
          value={value.day}
          onChange={(e) => set({ day: +e.target.value })}
          className={selectCls}
        >
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        {/* Month */}
        <select
          value={value.month}
          onChange={(e) => set({ month: +e.target.value })}
          className={`${selectCls} flex-1 min-w-[130px]`}
        >
          {THAI_MONTHS.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>

        {/* Year พ.ศ. */}
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value.yearBE}
            onChange={(e) => set({ yearBE: +e.target.value })}
            min={2500}
            max={2600}
            className={`${selectCls} w-20 text-center`}
          />
          <span className="text-xs text-on-surface-variant">พ.ศ.</span>
        </div>
      </div>

      {/* Row 2: Time */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-on-surface-variant">เวลา</span>
        <select
          value={value.hour}
          onChange={(e) => set({ hour: +e.target.value })}
          className={selectCls}
        >
          {Array.from({ length: 24 }, (_, i) => i).map((h) => (
            <option key={h} value={h}>{String(h).padStart(2, "0")}</option>
          ))}
        </select>
        <span className="text-on-surface-variant">:</span>
        <select
          value={value.minute}
          onChange={(e) => set({ minute: +e.target.value })}
          className={selectCls}
        >
          {[0, 15, 30, 45].map((m) => (
            <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
          ))}
        </select>
        <span className="text-xs text-on-surface-variant">น.</span>
      </div>

      {/* Preview */}
      <p className="text-xs text-primary font-medium flex items-center gap-1">
        <Calendar size={11} />
        {formatThaiDateDisplay(thaiDateToIso(value))}
      </p>
    </div>
  );
}

// ---- Main component ----

/** แปลง nextActions array → string คำสั่งผู้บริหาร */
function buildDirectorNoteFromActions(actions: string[]): string {
  if (!actions || actions.length === 0) return "";
  if (actions.length === 1) return actions[0];
  return actions.map((a, i) => `${i + 1}. ${a}`).join("\n");
}

export default function AssignButton({ caseId, status, caseDueDate, nextActions }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [directorNote, setDirectorNote] = useState("");
  const [routingPath, setRoutingPath] = useState<"direct" | "via_vice">("direct");

  // Default: "from_doc" ถ้ามีวันที่จากหนังสือ, ไม่งั้น "none"
  const defaultMode: DueDateMode = caseDueDate ? "from_doc" : "none";
  const [dueDateMode, setDueDateMode] = useState<DueDateMode>(defaultMode);
  const [customThaiDate, setCustomThaiDate] = useState<ThaiDate>(
    isoToThaiDate(caseDueDate ?? undefined)
  );

  // AI recommendation state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
  const [aiRagHits, setAiRagHits] = useState(0);
  const [aiExpanded, setAiExpanded] = useState(true);

  if (!["registered", "assigned"].includes(status)) return null;

  const loadStaff = async () => {
    try {
      const res = await apiFetch<StaffMember[]>("/auth/users");
      setStaff(Array.isArray(res) ? res : []);
    } catch {
      setStaff([]);
    }
  };

  const handleOpen = async () => {
    setOpen(true);
    setDirectorNote(nextActions && nextActions.length > 0 ? buildDirectorNoteFromActions(nextActions) : "");

    // โหลด staff list เสมอ (ไม่ขึ้นกับ pre-selection)
    loadStaff();

    // ตัดสินใจ pre-selection: sessionStorage (จาก upload modal) → API (assignments เดิม)
    const preAssignStr = typeof window !== "undefined"
      ? sessionStorage.getItem("preAssignUserIds")
      : null;
    if (preAssignStr) {
      sessionStorage.removeItem("preAssignUserIds");
      try {
        const ids = JSON.parse(preAssignStr) as number[];
        setSelected(new Set(ids));
        return;
      } catch { /* fall through to API */ }
    }
    try {
      const existing = await apiFetch<{ assignedTo: { id: number } }[]>(`/cases/${caseId}/assignments`);
      setSelected(new Set((existing ?? []).map((a) => a.assignedTo.id)));
    } catch {
      setSelected(new Set());
    }
    setDueDateMode(caseDueDate ? "from_doc" : "none");
    setCustomThaiDate(isoToThaiDate(caseDueDate ?? undefined));
    setAiRecommendation(null);
    setAiRagHits(0);
    setAiExpanded(true);
    loadStaff();
  };

  const handleAiRecommend = async () => {
    setAiLoading(true);
    setAiRecommendation(null);
    try {
      const res = await apiFetch<{ recommendation: string; ragHits: number }>(
        `/cases/${caseId}/assign-recommend`,
        { method: "POST" }
      );
      setAiRecommendation(res.recommendation);
      setAiRagHits(res.ragHits);
      setAiExpanded(true);
    } catch (err: unknown) {
      setAiRecommendation("ไม่สามารถเรียก AI ได้: " + (err as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiToDirectorNote = () => {
    if (!aiRecommendation) return;
    // ดึงเฉพาะส่วน "คำแนะนำการมอบหมาย" มาใส่ directorNote
    const match = aiRecommendation.match(/(?:3\.|คำแนะนำการมอบหมาย)[^\n]*\n([\s\S]+?)(?:\n\n|$)/i);
    const extracted = match ? match[1].trim() : aiRecommendation;
    setDirectorNote(extracted.substring(0, 300));
  };

  const toggleUser = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resolvedDueDate = (): string | undefined => {
    if (dueDateMode === "from_doc") return caseDueDate ?? undefined;
    if (dueDateMode === "custom") return thaiDateToIso(customThaiDate);
    return undefined;
  };

  const handleAssign = async () => {
    if (selected.size === 0) { toastWarning("กรุณาเลือกผู้รับผิดชอบ"); return; }
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
        body: JSON.stringify({
          assignments,
          directorNote: directorNote || undefined,
          routingPath,
        }),
      });
      toastSuccess("มอบหมายงานสำเร็จ" + (dueDate ? " — บันทึก Google Calendar แล้ว" : ""));
      setOpen(false);
      window.dispatchEvent(new CustomEvent("assign-success"));
      router.refresh();
    } catch (err: unknown) {
      toastError((err as Error).message || "มอบหมายไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const dueDateModeOptions: {
    value: DueDateMode;
    label: string;
    icon: React.ReactNode;
    desc?: string;
    disabled?: boolean;
  }[] = [
    {
      value: "from_doc",
      label: "ใช้วันที่จากหนังสือ",
      icon: <CalendarCheck size={15} />,
      desc: caseDueDate ? formatThaiDateDisplay(caseDueDate) : "ไม่พบวันที่ในหนังสือ",
      disabled: !caseDueDate,
    },
    {
      value: "custom",
      label: "เลือกวันที่เอง",
      icon: <Calendar size={15} />,
    },
    {
      value: "none",
      label: "ไม่กำหนด",
      icon: <CalendarOff size={15} />,
      desc: "ไม่เพิ่มเข้า Google Calendar",
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

              {/* AI Recommend */}
              <div className="rounded-xl border border-purple-200 bg-purple-50/60 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-purple-600" />
                    <span className="text-sm font-semibold text-purple-800">คำแนะนำจาก AI</span>
                    {aiRagHits > 0 && (
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">
                        RAG {aiRagHits} แหล่ง
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {aiRecommendation && (
                      <button
                        type="button"
                        onClick={() => setAiExpanded((v) => !v)}
                        className="p-1 hover:bg-purple-100 rounded-lg text-purple-600"
                      >
                        {aiExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleAiRecommend}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-60 transition-colors"
                    >
                      {aiLoading ? (
                        <><Loader2 size={12} className="animate-spin" /> กำลังวิเคราะห์...</>
                      ) : (
                        <><Sparkles size={12} /> ขอคำแนะนำจาก AI</>
                      )}
                    </button>
                  </div>
                </div>

                {aiRecommendation && aiExpanded && (
                  <div className="px-4 pb-4 space-y-2">
                    <div className="bg-white rounded-lg p-3 border border-purple-100 text-sm text-on-surface whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                      {aiRecommendation}
                    </div>
                    <button
                      type="button"
                      onClick={applyAiToDirectorNote}
                      className="text-xs text-purple-700 hover:text-purple-900 font-medium underline underline-offset-2"
                    >
                      ใช้คำแนะนำนี้เป็นคำสั่งผู้บริหาร
                    </button>
                  </div>
                )}

                {!aiRecommendation && !aiLoading && (
                  <p className="px-4 pb-3 text-xs text-purple-600/70">
                    AI จะวิเคราะห์เนื้อหาหนังสือ + ค้นหาข้อมูลจากฐานนโยบาย สพฐ. แล้วแนะนำแนวทางการดำเนินการ
                  </p>
                )}
              </div>

              {/* Due date mode */}
              <div>
                <p className="text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-1.5">
                  <Calendar size={14} />
                  วันที่ดำเนินการ
                  <span className="text-[11px] font-normal text-outline">(บันทึก Google Calendar)</span>
                </p>
                <div className="space-y-2">
                  {dueDateModeOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        dueDateMode === opt.value
                          ? "border-primary/40 bg-primary/5"
                          : "border-outline-variant/20 hover:bg-surface-bright"
                      } ${opt.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      <input
                        type="radio"
                        name="dueDateMode"
                        value={opt.value}
                        checked={dueDateMode === opt.value}
                        onChange={() => !opt.disabled && setDueDateMode(opt.value)}
                        disabled={opt.disabled}
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
                          <p className={`text-xs mt-0.5 ${dueDateMode === opt.value && opt.value === "from_doc" ? "text-primary font-medium" : "text-on-surface-variant"}`}>
                            {opt.desc}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                {/* Thai date picker — แสดงเฉพาะ custom mode */}
                {dueDateMode === "custom" && (
                  <ThaiDateTimePicker
                    value={customThaiDate}
                    onChange={setCustomThaiDate}
                  />
                )}
              </div>

              {/* Routing path */}
              <div>
                <p className="text-sm font-semibold text-on-surface-variant mb-2">เส้นทางการเกษียณ</p>
                <div className="space-y-2">
                  {(
                    [
                      { value: "direct" as const, label: "ส่งตรงถึง ผอ." },
                      { value: "via_vice" as const, label: "ผ่านรอง ผอ. ก่อน" },
                    ] as { value: "direct" | "via_vice"; label: string }[]
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        routingPath === opt.value
                          ? "border-primary/40 bg-primary/5"
                          : "border-outline-variant/20 hover:bg-surface-bright"
                      }`}
                    >
                      <input
                        type="radio"
                        name="routingPath"
                        value={opt.value}
                        checked={routingPath === opt.value}
                        onChange={() => setRoutingPath(opt.value)}
                        className="accent-primary"
                      />
                      <span className="text-sm font-medium text-on-surface">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Director note */}
              <div>
                <label className="text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                  คำสั่งผู้บริหาร
                  {nextActions && nextActions.length > 0 && (
                    <span className="text-[10px] font-normal bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                      จากการวิเคราะห์หนังสือ
                    </span>
                  )}
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
