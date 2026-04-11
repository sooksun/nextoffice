"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { getUser } from "@/lib/auth";
import { Mail, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface SmtpConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  smtpSecure: boolean;
  configured?: boolean;
}

const PRESETS: Record<string, Partial<SmtpConfig>> = {
  gmail: { smtpHost: "smtp.gmail.com", smtpPort: 587, smtpSecure: false },
  outlook: { smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false },
  yahoo: { smtpHost: "smtp.mail.yahoo.com", smtpPort: 587, smtpSecure: false },
};

export default function EmailSettingsPage() {
  const [orgId, setOrgId] = useState<number>(0);
  const [form, setForm] = useState<SmtpConfig>({
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    smtpSecure: false,
  });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    const user = getUser();
    const id = (user as any)?.organizationId || 1;
    setOrgId(id);
    apiFetch<SmtpConfig & { configured: boolean }>(`/organizations/${id}/smtp`)
      .then((cfg) => {
        setForm({
          smtpHost: cfg.smtpHost || "",
          smtpPort: cfg.smtpPort || 587,
          smtpUser: cfg.smtpUser || "",
          smtpPass: cfg.smtpPass || "",
          smtpFrom: cfg.smtpFrom || "",
          smtpSecure: cfg.smtpSecure || false,
        });
      })
      .catch(() => {});
  }, []);

  const update = (field: keyof SmtpConfig, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    if (p) setForm((prev) => ({ ...prev, ...p }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(`/organizations/${orgId}/smtp/test`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setTestResult(res);
      if (res.ok) toastSuccess("เชื่อมต่อ SMTP สำเร็จ");
      else toastError(`เชื่อมต่อไม่สำเร็จ: ${res.error}`);
    } catch (err: unknown) {
      setTestResult({ ok: false, error: (err as Error).message });
      toastError("เชื่อมต่อไม่สำเร็จ");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!form.smtpHost || !form.smtpUser || !form.smtpFrom) {
      toastError("กรุณากรอก Host, Username และ From email");
      return;
    }
    setLoading(true);
    try {
      await apiFetch(`/organizations/${orgId}/smtp`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      toastSuccess("บันทึกการตั้งค่า SMTP สำเร็จ");
    } catch (err: unknown) {
      toastError((err as Error).message || "บันทึกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Mail size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">ตั้งค่าอีเมลสารบรรณ</h1>
          <p className="text-xs text-on-surface-variant">SMTP สำหรับส่งหนังสือออกทางอีเมล</p>
        </div>
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="text-sm text-on-surface-variant self-center mr-2">Preset:</span>
        {Object.entries(PRESETS).map(([key, _]) => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-bright text-on-surface-variant hover:text-primary hover:border-primary/30 border border-outline-variant/20 transition-colors capitalize"
          >
            {key}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">SMTP Host</label>
            <input
              type="text"
              value={form.smtpHost}
              onChange={(e) => update("smtpHost", e.target.value)}
              placeholder="smtp.gmail.com"
              className="input-text w-full"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">Port</label>
            <input
              type="number"
              value={form.smtpPort}
              onChange={(e) => update("smtpPort", parseInt(e.target.value) || 587)}
              className="input-text w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">Username</label>
            <input
              type="text"
              value={form.smtpUser}
              onChange={(e) => update("smtpUser", e.target.value)}
              placeholder="saraban@school.ac.th"
              className="input-text w-full"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-on-surface-variant mb-1 block">Password</label>
            <input
              type="password"
              value={form.smtpPass}
              onChange={(e) => update("smtpPass", e.target.value)}
              placeholder="App password"
              className="input-text w-full"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-on-surface-variant mb-1 block">
            From Email (อีเมลสารบรรณ)
          </label>
          <input
            type="email"
            value={form.smtpFrom}
            onChange={(e) => update("smtpFrom", e.target.value)}
            placeholder="saraban@school.ac.th"
            className="input-text w-full"
          />
          <p className="text-xs text-on-surface-variant mt-1">
            ตามระเบียบฯ ฉบับที่ 4 ให้ใช้รูปแบบ saraban@xxx เช่น saraban@school.ac.th
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.smtpSecure}
            onChange={(e) => update("smtpSecure", e.target.checked)}
            className="w-4 h-4 rounded border-outline-variant"
          />
          <span className="text-sm text-on-surface-variant">ใช้ SSL/TLS (port 465)</span>
        </label>

        {/* Test result */}
        {testResult && (
          <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${testResult.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {testResult.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {testResult.ok ? "เชื่อมต่อ SMTP สำเร็จ" : `ไม่สำเร็จ: ${testResult.error}`}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleTest}
            disabled={testing || !form.smtpHost}
            className="flex-1 py-3 px-4 bg-surface-bright text-on-surface border border-outline-variant/20 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold transition-transform active:scale-95 disabled:opacity-50"
          >
            {testing ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            {testing ? "กำลังทดสอบ..." : "ทดสอบการเชื่อมต่อ"}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-3 px-4 bg-primary text-on-primary rounded-2xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95 disabled:opacity-50"
          >
            {loading ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>

      {/* Gmail instructions */}
      <div className="mt-6 rounded-2xl border border-outline-variant/10 bg-surface-bright p-5">
        <h3 className="text-sm font-bold text-on-surface mb-2">สำหรับ Gmail / Google Workspace</h3>
        <ol className="text-xs text-on-surface-variant space-y-1 list-decimal list-inside">
          <li>เปิด 2-Step Verification ใน Google Account</li>
          <li>ไปที่ Security &gt; App passwords &gt; สร้าง App password สำหรับ &quot;Mail&quot;</li>
          <li>ใช้ App password แทน password ปกติ</li>
          <li>Host: smtp.gmail.com / Port: 587 / Secure: ปิด (STARTTLS)</li>
        </ol>
      </div>
    </div>
  );
}
