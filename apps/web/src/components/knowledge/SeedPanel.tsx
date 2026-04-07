"use client";

import { useState } from "react";
import { Download, Globe, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface SeedResult {
  created: number;
  skipped: number;
  policies?: string[];
}

interface Stats {
  policyCount: number;
  clauseCount: number;
  horizonSourceCount: number;
  horizonDocCount: number;
}

export default function SeedPanel({ stats }: { stats: Stats }) {
  const [seedingPolicy, setSeedingPolicy] = useState(false);
  const [seedingHorizon, setSeedingHorizon] = useState(false);
  const [policyResult, setPolicyResult] = useState<SeedResult | null>(null);
  const [horizonResult, setHorizonResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSeedPolicy() {
    setSeedingPolicy(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/knowledge/seed-obec`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setPolicyResult(data);
      // Reload page to refresh stats and list
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSeedingPolicy(false);
    }
  }

  async function handleSeedHorizon() {
    setSeedingHorizon(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/knowledge/seed-horizon-sources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setHorizonResult(data);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSeedingHorizon(false);
    }
  }

  const needsPolicySeed = stats.policyCount === 0;
  const needsHorizonSeed = stats.horizonSourceCount === 0;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <Download size={18} className="text-amber-700" />
        </div>
        <div>
          <h2 className="font-bold text-amber-900">เริ่มต้นฐานข้อมูลนโยบาย สพฐ.</h2>
          <p className="text-sm text-amber-700 mt-0.5">
            Seed ข้อมูลนโยบายและแหล่งข้อมูลเริ่มต้นเพื่อให้ AI RAG ทำงานได้
          </p>
        </div>
      </div>

      {/* Current stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "นโยบาย", value: stats.policyCount, warn: stats.policyCount === 0 },
          { label: "มาตรา/ข้อ", value: stats.clauseCount, warn: stats.clauseCount === 0 },
          { label: "แหล่ง Horizon", value: stats.horizonSourceCount, warn: stats.horizonSourceCount === 0 },
          { label: "เอกสาร Horizon", value: stats.horizonDocCount, warn: false },
        ].map((s) => (
          <div
            key={s.label}
            className={`rounded-xl px-3 py-2.5 text-center border ${
              s.warn
                ? "bg-red-50 border-red-200"
                : "bg-white border-outline-variant/20"
            }`}
          >
            <p className={`text-xl font-black ${s.warn ? "text-red-600" : "text-on-surface"}`}>
              {s.value}
            </p>
            <p className="text-[11px] text-on-surface-variant">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Seed buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSeedPolicy}
          disabled={seedingPolicy || !!policyResult}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all
            bg-primary text-on-primary hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          {seedingPolicy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : policyResult ? (
            <CheckCircle size={15} />
          ) : (
            <Download size={15} />
          )}
          {policyResult
            ? `เพิ่มแล้ว ${policyResult.created} นโยบาย`
            : "Seed นโยบาย สพฐ. 8 รายการ"}
          {needsPolicySeed && !policyResult && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full">จำเป็น</span>
          )}
        </button>

        <button
          onClick={handleSeedHorizon}
          disabled={seedingHorizon || !!horizonResult}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all
            bg-secondary text-on-secondary hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          {seedingHorizon ? (
            <Loader2 size={15} className="animate-spin" />
          ) : horizonResult ? (
            <CheckCircle size={15} />
          ) : (
            <Globe size={15} />
          )}
          {horizonResult
            ? `เพิ่มแล้ว ${horizonResult.created} แหล่ง`
            : "Seed แหล่งข้อมูล สพฐ./ศธ. 5 แหล่ง"}
          {needsHorizonSeed && !horizonResult && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full">จำเป็น</span>
          )}
        </button>
      </div>

      {/* Results */}
      {(policyResult || horizonResult) && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800 flex items-start gap-2">
          <CheckCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            {policyResult && (
              <p>นโยบาย: เพิ่มใหม่ {policyResult.created} รายการ, ข้ามซ้ำ {policyResult.skipped} รายการ</p>
            )}
            {horizonResult && (
              <p>แหล่งข้อมูล: เพิ่มใหม่ {horizonResult.created} แหล่ง, ข้ามซ้ำ {horizonResult.skipped} แหล่ง</p>
            )}
            <p className="text-xs mt-1 text-green-700">กำลังรีโหลดหน้า...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {!needsPolicySeed && !needsHorizonSeed && !policyResult && !horizonResult && (
        <p className="text-xs text-green-700 flex items-center gap-1">
          <CheckCircle size={12} />
          ฐานข้อมูลพร้อมใช้งานแล้ว — AI RAG จะใช้ข้อมูลนี้ในการเสนอแนะแนวทาง
        </p>
      )}
    </div>
  );
}
