"use client";

import { useState, useEffect } from "react";
import {
  CalendarDays,
  Database,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Trash2,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

// ─── types ────────────────────────────────────────────────────────────────────

interface Organization {
  id: number;
  name: string;
  orgCode: string;
  activeAcademicYear?: { id: number; year: number; name: string } | null;
}

interface ResetResult {
  success: boolean;
  newAcademicYear: { id: number; year: number; name: string };
  deleted: Record<string, number>;
  message: string;
}

interface DemoResult {
  success: boolean;
  organizationName: string;
  items: string[];
  summary: { total: number; created: number; skipped: number };
  message: string;
}

const currentThaiYear = new Date().getFullYear() + 543;

// ─── page ─────────────────────────────────────────────────────────────────────

export default function SystemAdminPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  useEffect(() => {
    apiFetch<Organization[]>("/organizations")
      .then((r) => setOrgs(Array.isArray(r) ? r : []))
      .catch(() => {})
      .finally(() => setLoadingOrgs(false));
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-on-surface flex items-center gap-2">
          <Database size={22} className="text-primary" />
          System Management
        </h1>
        <p className="text-sm text-on-surface-variant mt-0.5">
          จัดการข้อมูลระบบ — เฉพาะ ADMIN เท่านั้น
        </p>
      </div>

      {loadingOrgs ? (
        <div className="h-32 bg-surface-low rounded-2xl animate-pulse" />
      ) : (
        <>
          <ResetYearCard orgs={orgs} />
          <DemoDataCard orgs={orgs} />
        </>
      )}
    </div>
  );
}

// ─── Reset Year Card ──────────────────────────────────────────────────────────

function ResetYearCard({ orgs }: { orgs: Organization[] }) {
  const [orgId, setOrgId] = useState<number | "">("");
  const [year, setYear] = useState(currentThaiYear + 1);
  const [startDate, setStartDate] = useState(`${year - 543 + 1}-05-16`);
  const [endDate, setEndDate] = useState(`${year - 543 + 2}-03-31`);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const selectedOrg = orgs.find((o) => o.id === orgId);

  function handleYearChange(v: number) {
    setYear(v);
    setStartDate(`${v - 543 + 1}-05-16`);
    setEndDate(`${v - 543 + 2}-03-31`);
  }

  async function handleSubmit() {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setConfirming(false);
    try {
      const res = await apiFetch<ResetResult>("/admin/new-academic-year", {
        method: "POST",
        body: JSON.stringify({
          organizationId: orgId,
          year,
          startDate,
          endDate,
        }),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  const deletedEntries = result
    ? Object.entries(result.deleted).filter(([, v]) => v > 0)
    : [];
  const totalDeleted = deletedEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <section className="bg-surface-low border border-outline-variant/10 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-xl bg-amber-100 text-amber-600 shrink-0">
          <CalendarDays size={18} />
        </div>
        <div>
          <h2 className="font-black text-base">เริ่มต้นปีการศึกษาใหม่</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            สร้างปีการศึกษาใหม่ ล้างข้อมูล transaction (หนังสือรับ, การมอบหมาย, ทะเบียน) ของหน่วยงาน
            และ reset เลขรับเป็น 0 — ข้อมูลผู้ใช้และโครงสร้างองค์กรยังคงอยู่
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {/* org */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-on-surface-variant mb-1">หน่วยงาน</label>
          <select
            value={orgId}
            onChange={(e) => setOrgId(Number(e.target.value) || "")}
            className="w-full px-3 py-2 text-sm rounded-xl border border-outline-variant/30 bg-surface focus:outline-none focus:border-primary"
          >
            <option value="">— เลือกหน่วยงาน —</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} {o.orgCode ? `(${o.orgCode})` : ""}
              </option>
            ))}
          </select>
          {selectedOrg?.activeAcademicYear && (
            <p className="text-[11px] text-outline mt-1">
              ปีปัจจุบัน: {selectedOrg.activeAcademicYear.name}
            </p>
          )}
        </div>

        {/* year */}
        <div>
          <label className="block text-xs font-bold text-on-surface-variant mb-1">ปีการศึกษาใหม่ (พ.ศ.)</label>
          <input
            type="number"
            value={year}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            min={2560}
            max={2600}
            className="w-full px-3 py-2 text-sm rounded-xl border border-outline-variant/30 bg-surface focus:outline-none focus:border-primary"
          />
        </div>

        {/* start / end */}
        <div>
          <label className="block text-xs font-bold text-on-surface-variant mb-1">วันที่เริ่ม – สิ้นสุด</label>
          <div className="flex gap-1.5 items-center">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="flex-1 px-2 py-2 text-xs rounded-xl border border-outline-variant/30 bg-surface focus:outline-none focus:border-primary"
            />
            <span className="text-xs text-outline">–</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="flex-1 px-2 py-2 text-xs rounded-xl border border-outline-variant/30 bg-surface focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 mb-4">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <span>
          การดำเนินการนี้จะ<strong>ลบข้อมูลหนังสือรับ การมอบหมาย และทะเบียนหนังสือทั้งหมด</strong>ของหน่วยงานที่เลือก
          กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 mb-3">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 mb-1">
            <CheckCircle2 size={14} />
            {result.message}
          </div>
          <p className="text-xs text-emerald-600">
            ปีการศึกษาใหม่: <strong>{result.newAcademicYear.name}</strong>
          </p>
          {totalDeleted > 0 && (
            <button
              onClick={() => setShowDeleted((s) => !s)}
              className="flex items-center gap-1 text-[11px] text-emerald-600 mt-1.5 hover:underline"
            >
              {showDeleted ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              ดูรายละเอียดที่ลบ ({totalDeleted} รายการ)
            </button>
          )}
          {showDeleted && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
              {deletedEntries.map(([k, v]) => (
                <div key={k} className="flex justify-between text-[11px] bg-emerald-100 rounded-lg px-2 py-1">
                  <span className="text-emerald-700">{k}</span>
                  <span className="font-bold text-emerald-800">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirm / Submit */}
      {!confirming ? (
        <button
          disabled={!orgId || loading}
          onClick={() => setConfirming(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors disabled:opacity-40"
        >
          <Trash2 size={14} />
          เริ่มปีการศึกษาใหม่
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-rose-600">ยืนยันการลบข้อมูลทั้งหมดของ {selectedOrg?.name}?</span>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-40"
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
            ยืนยัน
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="px-3 py-1.5 rounded-xl border border-outline-variant/30 text-sm text-on-surface-variant hover:bg-surface-high"
          >
            ยกเลิก
          </button>
        </div>
      )}
    </section>
  );
}

// ─── Demo Data Card ───────────────────────────────────────────────────────────

function DemoDataCard({ orgs }: { orgs: Organization[] }) {
  const [orgId, setOrgId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showItems, setShowItems] = useState(false);

  async function handleSeed() {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<DemoResult>("/admin/seed-demo", {
        method: "POST",
        body: JSON.stringify({ organizationId: orgId }),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  const demoScenarios = [
    { status: "new", label: "ใหม่", desc: "หนังสือแจ้งผลการประเมิน", color: "text-slate-500 bg-slate-100" },
    { status: "registered", label: "ลงรับแล้ว", desc: "หนังสือเชิญประชุม", color: "text-blue-600 bg-blue-100" },
    { status: "assigned", label: "มอบหมายแล้ว", desc: "หนังสือขอสนับสนุนงบ", color: "text-violet-600 bg-violet-100" },
    { status: "in_progress", label: "กำลังดำเนินการ", desc: "หนังสือให้จัดทำ SAR", color: "text-amber-600 bg-amber-100" },
    { status: "completed", label: "เสร็จสิ้น", desc: "หนังสือประสานงาน", color: "text-emerald-600 bg-emerald-100" },
  ];

  return (
    <section className="bg-surface-low border border-outline-variant/10 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-xl bg-violet-100 text-violet-600 shrink-0">
          <FlaskConical size={18} />
        </div>
        <div>
          <h2 className="font-black text-base">สร้างข้อมูลทดสอบ (Demo)</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            สร้างหนังสือตัวอย่าง 5 รายการที่ครอบคลุมทุกขั้นตอน workflow เพื่อให้ทดสอบระบบได้ทันที
          </p>
        </div>
      </div>

      {/* Scenario preview */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-4">
        {demoScenarios.map((s) => (
          <div key={s.status} className="bg-surface border border-outline-variant/10 rounded-xl p-2.5 text-center">
            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold mb-1 ${s.color}`}>
              {s.label}
            </span>
            <p className="text-[11px] text-on-surface-variant line-clamp-2">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 mb-4">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>
          ต้องการบุคลากรพื้นฐาน (ผอ. + ธุรการ) — รัน <code className="font-mono bg-blue-100 px-1 rounded">npm run seed:school</code> ก่อนหากยังไม่มี
          หากข้อมูลมีอยู่แล้วจะข้ามโดยอัตโนมัติ
        </span>
      </div>

      {/* Org select */}
      <div className="mb-4">
        <label className="block text-xs font-bold text-on-surface-variant mb-1">หน่วยงาน</label>
        <select
          value={orgId}
          onChange={(e) => setOrgId(Number(e.target.value) || "")}
          className="w-full sm:max-w-sm px-3 py-2 text-sm rounded-xl border border-outline-variant/30 bg-surface focus:outline-none focus:border-primary"
        >
          <option value="">— เลือกหน่วยงาน —</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} {o.orgCode ? `(${o.orgCode})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 mb-3">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 mb-1">
            <CheckCircle2 size={14} />
            {result.message}
          </div>
          <div className="flex gap-3 text-xs text-emerald-600">
            <span>สร้างใหม่: <strong>{result.summary.created}</strong></span>
            {result.summary.skipped > 0 && (
              <span>ข้าม: <strong>{result.summary.skipped}</strong></span>
            )}
          </div>
          {result.items.length > 0 && (
            <button
              onClick={() => setShowItems((s) => !s)}
              className="flex items-center gap-1 text-[11px] text-emerald-600 mt-1.5 hover:underline"
            >
              {showItems ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              ดูรายละเอียด
            </button>
          )}
          {showItems && (
            <ul className="mt-2 space-y-0.5">
              {result.items.map((item, i) => (
                <li key={i} className={`text-[11px] px-2 py-0.5 rounded-md ${item.startsWith("ข้าม") ? "text-outline bg-surface" : "text-emerald-700 bg-emerald-100"}`}>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        disabled={!orgId || loading}
        onClick={handleSeed}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 transition-colors disabled:opacity-40"
      >
        {loading ? <RefreshCw size={14} className="animate-spin" /> : <FlaskConical size={14} />}
        สร้างข้อมูลทดสอบ
      </button>
    </section>
  );
}
