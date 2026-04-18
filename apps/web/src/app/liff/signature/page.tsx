"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, getAuthToken } from "@/lib/api";
import { toast } from "react-toastify";
import SignaturePad from "@/components/SignaturePad";
import { useLiff } from "../LiffBoot";

interface StaffItem {
  id: number;
  fullName: string;
  signaturePath: string | null;
}

export default function LiffSignaturePage() {
  const { status } = useLiff();
  const [user, setUser] = useState<any>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [loading, setLoading] = useState(true);
  const [padData, setPadData] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);

  useEffect(() => {
    if (status !== "ready") return;
    const u = JSON.parse(localStorage.getItem("user") ?? "null");
    setUser(u);

    apiFetch<StaffItem[]>("/staff-config")
      .then((list) => {
        const arr = Array.isArray(list) ? list : (list as any).data ?? [];
        const me = arr.find((s: StaffItem) => Number(s.id) === Number(u?.id));
        setHasSignature(!!me?.signaturePath);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status]);

  const sigUrl = user
    ? `/api/files/signature/${user.id}?v=${previewVersion}`
    : null;

  const handleSave = async () => {
    if (!padData || !user) return toast.error("กรุณาลงลายเซ็นก่อน");
    setUploading(true);
    try {
      // Convert base64 → Blob → FormData (multipart)
      const base64Data = padData.replace(/^data:image\/\w+;base64,/, "");
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "image/png" });

      const formData = new FormData();
      formData.append("file", blob, "signature.png");

      const token = getAuthToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
      const res = await fetch(`${apiBase}/staff-config/${user.id}/signature`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("บันทึกลายเซ็นเรียบร้อย");
      setHasSignature(true);
      setPadData("");
      setPreviewVersion((v) => v + 1);
    } catch (e: any) {
      toast.error(e.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("ลบลายเซ็นปัจจุบัน? (ตอนลงนามจะต้องเซ็นสดแทน)")) return;
    if (!user) return;
    try {
      await apiFetch(`/staff-config/${user.id}/signature`, { method: "DELETE" });
      toast.success("ลบลายเซ็นเรียบร้อย");
      setHasSignature(false);
      setPreviewVersion((v) => v + 1);
    } catch (e: any) {
      toast.error(e.message ?? "ไม่สำเร็จ");
    }
  };

  if (loading) return <div className="p-6 text-center text-sm text-slate-500">กำลังโหลด…</div>;

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <h1 className="mb-1 text-lg font-semibold">ลายเซ็นอิเล็กทรอนิกส์</h1>
      <p className="mb-4 text-xs text-slate-500">
        ใช้ประทับบนเอกสารตอนลงนามเกษียณ (Stamp 3) — แทนการเซ็นสดทุกครั้ง
      </p>

      {/* Current signature */}
      {hasSignature && sigUrl && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold text-slate-700">ลายเซ็นปัจจุบัน</p>
          <img
            src={sigUrl}
            alt="signature"
            className="mx-auto h-32 w-auto rounded border border-dashed border-slate-300 bg-white p-2"
            onError={() => setHasSignature(false)}
          />
          <button
            onClick={handleDelete}
            className="mt-2 w-full rounded border border-rose-300 py-2 text-xs font-medium text-rose-600"
          >
            ลบลายเซ็น
          </button>
        </div>
      )}

      {/* Draw new */}
      <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-slate-700">
          {hasSignature ? "ลงลายเซ็นใหม่ (เขียนทับของเดิม)" : "ลงลายเซ็น"}
        </p>
        <p className="mb-3 text-xs text-slate-500">เขียนลายเซ็นในช่องด้านล่าง</p>
        <SignaturePad onSignature={setPadData} width={340} height={160} />
      </div>

      <button
        onClick={handleSave}
        disabled={!padData || uploading}
        className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
      >
        {uploading ? "กำลังบันทึก…" : "บันทึกลายเซ็น"}
      </button>
    </div>
  );
}
