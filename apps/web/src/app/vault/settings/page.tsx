"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  RefreshCw,
  CheckCircle,
} from "lucide-react";

interface VaultConfig {
  vaultPath: string;
  syncEnabled: boolean;
  autoGenerate: boolean;
  lastSyncAt: string | null;
}

export default function VaultSettingsPage() {
  const [config, setConfig] = useState<VaultConfig>({
    vaultPath: "",
    syncEnabled: false,
    autoGenerate: false,
    lastSyncAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const orgId = "1";

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<VaultConfig>(`/vault/config`);
        setConfig(data);
      } catch {
        // keep defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await apiFetch(`/vault/config`, {
        method: "PUT",
        body: JSON.stringify({
          vaultPath: config.vaultPath,
          syncEnabled: config.syncEnabled,
          autoGenerate: config.autoGenerate,
        }),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // silently handle
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setSyncSuccess(false);
    try {
      await apiFetch("/vault/sync", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
      // reload config to get updated lastSyncAt
      const data = await apiFetch<VaultConfig>(`/vault/config`);
      setConfig(data);
    } catch {
      // silently handle
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-on-surface-variant">
        กำลังโหลด...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/vault"
        className="inline-flex items-center gap-1 text-sm text-primary font-bold hover:underline"
      >
        <ArrowLeft size={14} />
        คลังความรู้
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
          ตั้งค่า Knowledge Vault
        </h1>
        <p className="text-on-surface-variant mt-1">
          จัดการการซิงค์และการสร้างบันทึกอัตโนมัติ
        </p>
      </div>

      {/* Config Form */}
      <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-6 space-y-6 max-w-2xl">
        {/* Vault Path */}
        <div>
          <label className="block text-sm font-bold text-on-surface mb-1.5">
            Vault Path
          </label>
          <input
            type="text"
            value={config.vaultPath}
            onChange={(e) => setConfig({ ...config, vaultPath: e.target.value })}
            placeholder="/path/to/vault"
            className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-low text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <p className="text-[11px] text-outline mt-1">
            ตำแหน่งจัดเก็บไฟล์ Markdown ของ Knowledge Vault
          </p>
        </div>

        {/* Sync Enabled */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-on-surface">เปิดใช้งานการซิงค์</p>
            <p className="text-[11px] text-outline">ซิงค์บันทึกจากเอกสารใหม่โดยอัตโนมัติ</p>
          </div>
          <button
            onClick={() => setConfig({ ...config, syncEnabled: !config.syncEnabled })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              config.syncEnabled ? "bg-primary" : "bg-outline/30"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                config.syncEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Auto Generate */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-on-surface">สร้างบันทึกอัตโนมัติ</p>
            <p className="text-[11px] text-outline">ให้ AI สร้าง Knowledge Note จากเอกสารที่เข้าสู่ระบบ</p>
          </div>
          <button
            onClick={() => setConfig({ ...config, autoGenerate: !config.autoGenerate })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              config.autoGenerate ? "bg-primary" : "bg-outline/30"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                config.autoGenerate ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Last Sync */}
        {config.lastSyncAt && (
          <div className="bg-surface-low rounded-xl p-4">
            <p className="text-xs text-outline">
              ซิงค์ล่าสุด: {new Date(config.lastSyncAt).toLocaleString("th-TH")}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-outline-variant/10">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-2xl font-bold text-sm disabled:opacity-50 hover:brightness-110 transition-all active:scale-95"
          >
            {saveSuccess ? <CheckCircle size={14} /> : <Save size={14} />}
            {saveSuccess ? "บันทึกแล้ว" : "บันทึกการตั้งค่า"}
          </button>
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-bright border border-outline-variant/30 text-on-surface rounded-2xl font-bold text-sm disabled:opacity-50 hover:bg-surface-high transition-all active:scale-95"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncSuccess ? "ซิงค์สำเร็จ" : "ซิงค์เดี๋ยวนี้"}
          </button>
        </div>
      </div>
    </div>
  );
}
