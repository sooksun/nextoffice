"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft, UserCheck, AlertCircle, Clock, Users, Camera,
  Trash2, CheckCircle, RefreshCw, ZoomIn, X, Plus,
} from "lucide-react";

type Template = {
  id: number;
  qualityScore: number;
  poseYaw: number;
  posePitch: number;
  lightScore: number;
  capturedAt: string;
  createdAt: string;
};

type UserEnrollment = {
  user: {
    id: number;
    fullName: string;
    email: string;
    roleCode: string;
    positionTitle: string | null;
    department: string | null;
    organization: { id: number; name: string; shortName: string | null };
  };
  profile: {
    id: number;
    profileStatus: string;
    templateCount: number;
    enrolledAt: string | null;
    lastRefreshedAt: string | null;
    notes: string | null;
  } | null;
  templates: Template[];
  minRequired: number;
  maxAllowed: number;
  canFinalize: boolean;
  canAddMore: boolean;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  none:         { label: "ยังไม่ลงทะเบียน", color: "bg-slate-100 text-slate-600",   icon: <Users size={12} /> },
  pending:      { label: "กำลังลงทะเบียน",  color: "bg-amber-100 text-amber-700",   icon: <Clock size={12} /> },
  active:       { label: "พร้อมใช้งาน",      color: "bg-emerald-100 text-emerald-700", icon: <UserCheck size={12} /> },
  needs_refresh:{ label: "ต้องลงทะเบียนใหม่", color: "bg-orange-100 text-orange-700", icon: <AlertCircle size={12} /> },
  suspended:    { label: "ถูกระงับ",         color: "bg-red-100 text-red-700",       icon: <AlertCircle size={12} /> },
};

const ROLE_TH: Record<string, string> = {
  ADMIN: "ผู้ดูแลระบบ", DIRECTOR: "ผู้อำนวยการ", VICE_DIRECTOR: "รองผู้อำนวยการ",
  HEAD_TEACHER: "หัวหน้างาน", TEACHER: "ครู", CLERK: "เจ้าหน้าที่",
};

export default function UserEnrollmentPage() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();

  const [data, setData] = useState<UserEnrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // camera state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // lightbox state
  const [lightboxId, setLightboxId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<UserEnrollment>(`/attendance/admin/enrollments/${userId}`);
      setData(res);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // ── Camera helpers ──────────────────────────────────────────────────────────

  const openCamera = async () => {
    setCaptureMsg(null);
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCaptureMsg("ไม่สามารถเปิดกล้องได้");
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCaptureMsg(null);
  };

  const captureFrame = async () => {
    if (!videoRef.current || !data?.canAddMore) return;
    setCapturing(true);
    setCaptureMsg(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0);
      const imageBase64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];

      const res = await apiFetch<{
        success: boolean; reason?: string; reasons?: string[];
        templateCount?: number; canAddMore?: boolean; quality?: any;
      }>(`/attendance/admin/enrollments/${userId}/upload-frame`, {
        method: "POST",
        body: JSON.stringify({ imageBase64 }),
      });

      if (!res.success) {
        const reasons = res.reasons?.join(", ") ?? res.reason ?? "ไม่ผ่านการตรวจสอบ";
        setCaptureMsg(`❌ ${reasons}`);
      } else {
        const q = res.quality?.score != null ? ` (quality: ${(res.quality.score * 100).toFixed(0)}%)` : "";
        setCaptureMsg(`✓ บันทึกรูปที่ ${res.templateCount}/${data.maxAllowed}${q}`);
        await load();
        if (!res.canAddMore) closeCamera();
      }
    } catch (err: any) {
      setCaptureMsg(`❌ ${err.message}`);
    } finally {
      setCapturing(false);
    }
  };

  // ── Admin actions ───────────────────────────────────────────────────────────

  const showMsg = (type: "ok" | "err", text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const deleteTemplate = async (templateId: number) => {
    if (!confirm("ต้องการลบรูปนี้?")) return;
    try {
      await apiFetch(`/attendance/admin/enrollments/templates/${templateId}`, { method: "DELETE" });
      showMsg("ok", "ลบรูปเรียบร้อย");
      await load();
    } catch (err: any) {
      showMsg("err", err.message ?? "เกิดข้อผิดพลาด");
    }
  };

  const activateProfile = async () => {
    if (!confirm("ยืนยัน enrollment สำหรับบุคคลนี้?")) return;
    try {
      await apiFetch(`/attendance/admin/enrollments/${userId}/activate`, { method: "POST" });
      showMsg("ok", "ยืนยัน enrollment เรียบร้อย");
      await load();
    } catch (err: any) {
      showMsg("err", err.message ?? "เกิดข้อผิดพลาด");
    }
  };

  const resetProfile = async () => {
    if (!confirm("รีเซ็ตใบหน้าทั้งหมดของบุคคลนี้? ไม่สามารถยกเลิกได้")) return;
    try {
      await apiFetch(`/attendance/admin/enrollments/${userId}/reset`, { method: "POST" });
      showMsg("ok", "รีเซ็ตเรียบร้อย");
      await load();
    } catch (err: any) {
      showMsg("err", err.message ?? "เกิดข้อผิดพลาด");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-400">กำลังโหลด…</div>;
  }
  if (!data) {
    return <div className="p-8 text-center text-sm text-red-500">ไม่พบข้อมูล</div>;
  }

  const { user, profile, templates, minRequired, maxAllowed, canFinalize, canAddMore } = data;
  const profileStatus = profile?.profileStatus ?? "none";
  const templateCount = profile?.templateCount ?? 0;
  const statusCfg = STATUS_CONFIG[profileStatus] ?? STATUS_CONFIG.none;
  const progress = Math.min(100, Math.round((templateCount / minRequired) * 100));

  return (
    <div>
      {/* Back */}
      <Link
        href="/attendance/enrollments"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary"
      >
        <ArrowLeft size={14} /> ย้อนกลับรายการทั้งหมด
      </Link>

      {/* Flash message */}
      {actionMsg && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${actionMsg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {actionMsg.text}
        </div>
      )}

      {/* User info card */}
      <div className="mb-5 rounded-xl border border-outline-variant/20 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{user.fullName}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{user.email}</p>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>{ROLE_TH[user.roleCode] ?? user.roleCode}</span>
              {user.positionTitle && <span>• {user.positionTitle}</span>}
              {user.department && <span>• {user.department}</span>}
              <span>• {user.organization.shortName ?? user.organization.name}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${statusCfg.color}`}>
              {statusCfg.icon} {statusCfg.label}
            </span>
            {profile?.enrolledAt && (
              <span className="text-[11px] text-slate-400">
                ลงทะเบียน {new Date(profile.enrolledAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
              </span>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>รูปใบหน้า: <strong className="text-slate-700">{templateCount}</strong> / {maxAllowed} รูป</span>
            <span className={templateCount >= minRequired ? "text-emerald-600" : "text-amber-600"}>
              {templateCount >= minRequired ? `✓ ผ่านขั้นต่ำ ${minRequired} รูป` : `ต้องการอีก ${minRequired - templateCount} รูป`}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${profileStatus === "active" ? "bg-emerald-500" : "bg-amber-400"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 text-[10px] text-slate-400">ขั้นต่ำ {minRequired} รูป | สูงสุด {maxAllowed} รูป</div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={openCamera}
            disabled={!canAddMore}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-40"
          >
            <Plus size={13} /> เพิ่มรูปใบหน้า
          </button>
          {canFinalize && profileStatus !== "active" && (
            <button
              onClick={activateProfile}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <CheckCircle size={13} /> ยืนยัน Enrollment
            </button>
          )}
          {profile && (
            <button
              onClick={resetProfile}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <RefreshCw size={13} /> รีเซ็ตทั้งหมด
            </button>
          )}
        </div>
      </div>

      {/* Camera panel */}
      {cameraOpen && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">ถ่ายรูปใบหน้า</p>
            <button onClick={closeCamera} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-48 w-64 object-cover"
              />
              {/* Face guide oval */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-36 w-28 rounded-full border-2 border-white/60" />
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3">
              <button
                onClick={captureFrame}
                disabled={capturing || !canAddMore}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                <Camera size={15} />
                {capturing ? "กำลังประมวลผล…" : "ถ่ายรูป"}
              </button>
              {captureMsg && (
                <p className={`max-w-48 text-xs ${captureMsg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>
                  {captureMsg}
                </p>
              )}
              <p className="text-[11px] text-slate-400">
                รูปที่ {templateCount + 1} / {maxAllowed}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Templates gallery */}
      <div className="rounded-xl border border-outline-variant/20 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">รูปใบหน้าที่ลงทะเบียนแล้ว ({templates.length})</h2>
        </div>

        {templates.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">ยังไม่มีรูปภาพ</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {templates.map((tpl, idx) => (
              <div key={tpl.id} className="group relative overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                {/* Thumbnail */}
                <div className="relative aspect-square overflow-hidden bg-slate-200">
                  <img
                    src={`/api/files/face-template/${tpl.id}`}
                    alt={`รูปที่ ${idx + 1}`}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23e2e8f0' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%2394a3b8' font-size='24'%3E?%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  {/* Overlay actions */}
                  <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => setLightboxId(tpl.id)}
                      className="rounded-full bg-white/90 p-1.5 text-slate-700 hover:bg-white"
                    >
                      <ZoomIn size={13} />
                    </button>
                    <button
                      onClick={() => deleteTemplate(tpl.id)}
                      className="rounded-full bg-red-500/90 p-1.5 text-white hover:bg-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {/* Index badge */}
                  <div className="absolute left-1.5 top-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                    {idx + 1}
                  </div>
                </div>

                {/* Metrics */}
                <div className="p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">คุณภาพ</span>
                    <span className={`text-[10px] font-semibold ${tpl.qualityScore >= 0.7 ? "text-emerald-600" : tpl.qualityScore >= 0.45 ? "text-amber-600" : "text-red-500"}`}>
                      {(tpl.qualityScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">pose Y/P</span>
                    <span className="text-[10px] text-slate-600">
                      {tpl.poseYaw.toFixed(0)}°/{tpl.posePitch.toFixed(0)}°
                    </span>
                  </div>
                  <div className="mt-1 text-[9px] text-slate-400">
                    {new Date(tpl.capturedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxId(null)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
            onClick={() => setLightboxId(null)}
          >
            <X size={20} />
          </button>
          <img
            src={`/api/files/face-template/${lightboxId}`}
            alt="face template"
            className="max-h-[80vh] max-w-[90vw] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
