"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { Upload, Trash2, Save, User, Loader2, ImageOff } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string;
  fullName: string;
  roleCode: string;
  positionTitle: string | null;
  hasSignature: boolean;
  email: string;
}

const ROLE_LABEL: Record<string, string> = {
  DIRECTOR: "ผู้อำนวยการ",
  VICE_DIRECTOR: "รองผู้อำนวยการ",
  CLERK: "เจ้าหน้าที่ธุรการ",
};

const ROLE_ORDER = ["DIRECTOR", "VICE_DIRECTOR", "CLERK"];

// ─── Sub-component: one staff card ───────────────────────────────────────────

function StaffCard({
  member,
  onSaved,
}: {
  member: StaffMember;
  onSaved: (updated: StaffMember) => void;
}) {
  const [positionTitle, setPositionTitle] = useState(member.positionTitle ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sigKey, setSigKey] = useState(0); // bump to force img reload
  const [hasSignature, setHasSignature] = useState(member.hasSignature);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = positionTitle !== (member.positionTitle ?? "");

  const savePosition = async () => {
    setSaving(true);
    try {
      await apiFetch(`/staff-config/${member.id}/position`, {
        method: "PATCH",
        body: JSON.stringify({ positionTitle }),
      });
      toastSuccess("บันทึกตำแหน่งแล้ว");
      onSaved({ ...member, positionTitle: positionTitle || null });
    } catch (err: unknown) {
      toastError((err as Error).message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const uploadSignature = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      // ใช้ fetch โดยตรง — ห้ามใส่ Content-Type header เองเพราะ browser ต้อง set boundary ให้
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
      const res = await fetch(`${apiBase}/staff-config/${member.id}/signature`, {
        method: "POST",
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${res.status}: ${text}`);
      }
      toastSuccess("อัปโหลดลายเซ็นแล้ว");
      setHasSignature(true);
      setSigKey((k) => k + 1);
      onSaved({ ...member, hasSignature: true });
    } catch (err: unknown) {
      toastError((err as Error).message || "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  const deleteSignature = async () => {
    if (!confirm("ลบรูปลายเซ็นนี้?")) return;
    setDeleting(true);
    try {
      await apiFetch(`/staff-config/${member.id}/signature`, { method: "DELETE" });
      toastSuccess("ลบลายเซ็นแล้ว");
      setHasSignature(false);
      onSaved({ ...member, hasSignature: false });
    } catch (err: unknown) {
      toastError((err as Error).message || "ลบไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <User size={16} className="text-primary" />
        </div>
        <div>
          <p className="font-semibold text-on-surface text-sm">{member.fullName}</p>
          <p className="text-xs text-on-surface-variant">{member.email}</p>
        </div>
        <span className="ml-auto px-2 py-0.5 rounded-lg text-xs font-semibold bg-primary/8 text-primary">
          {ROLE_LABEL[member.roleCode] ?? member.roleCode}
        </span>
      </div>

      {/* Position title */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">
          ตำแหน่ง
        </label>
        <div className="flex gap-2">
          <input
            value={positionTitle}
            onChange={(e) => setPositionTitle(e.target.value)}
            placeholder="เช่น ผู้อำนวยการโรงเรียน"
            className="flex-1 px-3 py-2 rounded-xl border border-outline-variant/30 bg-surface text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={savePosition}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-on-primary text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            บันทึก
          </button>
        </div>
      </div>

      {/* Signature */}
      <div>
        <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">
          ลายเซ็น
        </label>

        {hasSignature ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={sigKey}
              src={`/api/staff-config/${member.id}/signature?t=${sigKey}`}
              alt="ลายเซ็น"
              className="h-16 w-auto rounded-xl border border-outline-variant/20 bg-white object-contain p-1"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-bright border border-outline-variant/30 text-xs font-medium text-on-surface hover:bg-surface-variant/30 transition-colors"
              >
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                เปลี่ยน
              </button>
              <button
                onClick={deleteSignature}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-error/10 text-error text-xs font-medium hover:bg-error/20 transition-colors"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                ลบ
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-outline-variant/40 text-sm text-on-surface-variant hover:border-primary/50 hover:text-primary transition-colors w-full justify-center"
          >
            {uploading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ImageOff size={14} />
            )}
            {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูปลายเซ็น (PNG/JPEG, max 2 MB)"}
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadSignature(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StaffConfigPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<StaffMember[]>("/staff-config");
      setStaff(data);
    } catch {
      toastError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (updated: StaffMember) => {
    setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  // Group by role in defined order
  const grouped = ROLE_ORDER.map((role) => ({
    role,
    members: staff.filter((s) => s.roleCode === role),
  })).filter((g) => g.members.length > 0);

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-on-surface">ตั้งค่าบุคลากรผู้ลงนาม</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          กำหนดตำแหน่งและลายเซ็นสำหรับประทับตราในเอกสาร
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant text-sm">
          ไม่พบบุคลากร DIRECTOR / VICE_DIRECTOR / CLERK ในองค์กรนี้
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ role, members }) => (
            <div key={role}>
              <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-3">
                {ROLE_LABEL[role] ?? role}
              </h2>
              <div className="space-y-3">
                {members.map((m) => (
                  <StaffCard key={m.id} member={m} onSaved={handleSaved} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
