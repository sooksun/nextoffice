"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { getUser } from "@/lib/auth";
import { Mail, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldHint } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

function subscribeStorage(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function getOrgIdFromUser(): number {
  return getUser()?.organizationId ?? 1;
}

export default function EmailSettingsPage() {
  const orgId = useSyncExternalStore(subscribeStorage, getOrgIdFromUser, () => 1);
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
    apiFetch<SmtpConfig & { configured: boolean }>(`/organizations/${orgId}/smtp`)
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
  }, [orgId]);

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
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <span className="text-sm text-on-surface-variant mr-2">Preset:</span>
        {Object.keys(PRESETS).map((key) => (
          <Button key={key} variant="outline" size="sm" onClick={() => applyPreset(key)} className="capitalize">
            {key}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="smtpHost">SMTP Host</FieldLabel>
              <Input
                id="smtpHost"
                type="text"
                value={form.smtpHost}
                onChange={(e) => update("smtpHost", e.target.value)}
                placeholder="smtp.gmail.com"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="smtpPort">Port</FieldLabel>
              <Input
                id="smtpPort"
                type="number"
                value={form.smtpPort}
                onChange={(e) => update("smtpPort", parseInt(e.target.value) || 587)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="smtpUser">Username</FieldLabel>
              <Input
                id="smtpUser"
                type="text"
                value={form.smtpUser}
                onChange={(e) => update("smtpUser", e.target.value)}
                placeholder="saraban@school.ac.th"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="smtpPass">Password</FieldLabel>
              <Input
                id="smtpPass"
                type="password"
                value={form.smtpPass}
                onChange={(e) => update("smtpPass", e.target.value)}
                placeholder="App password"
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="smtpFrom">From Email (อีเมลสารบรรณ)</FieldLabel>
            <Input
              id="smtpFrom"
              type="email"
              value={form.smtpFrom}
              onChange={(e) => update("smtpFrom", e.target.value)}
              placeholder="saraban@school.ac.th"
            />
            <FieldHint>
              ตามระเบียบฯ ฉบับที่ 4 ให้ใช้รูปแบบ saraban@xxx เช่น saraban@school.ac.th
            </FieldHint>
          </Field>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <Checkbox
              checked={form.smtpSecure}
              onCheckedChange={(v) => update("smtpSecure", v === true)}
            />
            <span className="text-sm text-on-surface-variant">ใช้ SSL/TLS (port 465)</span>
          </label>

          {testResult && (
            <Alert variant={testResult.ok ? "success" : "error"}>
              {testResult.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              <AlertDescription>
                {testResult.ok ? "เชื่อมต่อ SMTP สำเร็จ" : `ไม่สำเร็จ: ${testResult.error}`}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              size="lg"
              onClick={handleTest}
              disabled={testing || !form.smtpHost}
              className="flex-1"
            >
              {testing ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
              {testing ? "กำลังทดสอบ..." : "ทดสอบการเชื่อมต่อ"}
            </Button>
            <Button size="lg" onClick={handleSave} disabled={loading} className="flex-1">
              {loading ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Gmail instructions */}
      <Card className="mt-6 bg-surface-low">
        <CardContent className="p-5">
          <h3 className="text-sm font-bold text-on-surface mb-2">สำหรับ Gmail / Google Workspace</h3>
          <ol className="text-xs text-on-surface-variant space-y-1 list-decimal list-inside">
            <li>เปิด 2-Step Verification ใน Google Account</li>
            <li>ไปที่ Security &gt; App passwords &gt; สร้าง App password สำหรับ &quot;Mail&quot;</li>
            <li>ใช้ App password แทน password ปกติ</li>
            <li>Host: smtp.gmail.com / Port: 587 / Secure: ปิด (STARTTLS)</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
