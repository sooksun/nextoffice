"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";

type FaceConfig = {
  acceptThreshold: number;
  reviewThreshold: number;
  minMargin: number;
  minQualityScore: number;
  minLivenessScore: number;
  livenessMode: string;
  minTemplatesRequired: number;
  reviewPolicy: string;
  qdrantCollection: string;
};

const FIELD_LABELS: Partial<Record<keyof FaceConfig, string>> = {
  acceptThreshold: "Accept Threshold (top-1 ≥ → ยืนยัน)",
  reviewThreshold: "Review Threshold (top-1 ≥ → ส่ง review)",
  minMargin: "Min Margin (top1 − top2 ≥ → ยืนยัน)",
  minQualityScore: "Min Quality Score (0–1)",
  minLivenessScore: "Min Liveness Score (0 = ปิด)",
  minTemplatesRequired: "จำนวน Template ขั้นต่ำ (enrollment)",
};

export default function FaceConfigPage() {
  const [config, setConfig] = useState<FaceConfig | null>(null);
  const [form, setForm] = useState<Partial<FaceConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<FaceConfig>("/attendance/face-config")
      .then((c) => { setConfig(c); setForm(c); })
      .catch(() => toast.error("โหลด config ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key: keyof FaceConfig, value: string) => {
    setForm((f) => ({ ...f, [key]: isNaN(Number(value)) ? value : Number(value) }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await apiFetch<FaceConfig>("/attendance/face-config", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setConfig(updated);
      setForm(updated);
      toast.success("บันทึก config สำเร็จ");
    } catch (e: any) {
      toast.error(e.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-sm text-slate-500">กำลังโหลด…</div>;

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-1 text-xl font-bold">Face Scan Config</h1>
      <p className="mb-6 text-sm text-slate-500">ตั้งค่า threshold และพฤติกรรมการสแกนใบหน้าของโรงเรียน</p>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        {(Object.keys(FIELD_LABELS) as (keyof FaceConfig)[]).map((key) => (
          <div key={key}>
            <label className="mb-1 block text-sm font-medium text-slate-700">{FIELD_LABELS[key]}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={key.includes("Required") ? 50 : 1}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={form[key] as number}
              onChange={(e) => handleChange(key, e.target.value)}
            />
          </div>
        ))}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Liveness Mode</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.livenessMode ?? "off"}
            onChange={(e) => setForm((f) => ({ ...f, livenessMode: e.target.value }))}
          >
            <option value="off">off (ปิด)</option>
            <option value="passive">passive (texture analysis)</option>
            <option value="challenge">challenge (ยังไม่พร้อม)</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Review Policy</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.reviewPolicy ?? "manual"}
            onChange={(e) => setForm((f) => ({ ...f, reviewPolicy: e.target.value }))}
          >
            <option value="manual">manual (เจ้าหน้าที่ตรวจ)</option>
            <option value="auto-reject">auto-reject (ปฏิเสธอัตโนมัติ)</option>
          </select>
        </div>

        {config && (
          <div className="rounded bg-slate-50 p-3 text-xs text-slate-500">
            Qdrant collection: <code className="font-mono">{config.qdrantCollection}</code>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก…" : "บันทึก Config"}
        </button>
        <button
          onClick={() => setForm(config!)}
          className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600"
        >
          รีเซ็ต
        </button>
      </div>
    </div>
  );
}
