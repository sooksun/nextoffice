"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { useLiff } from "../LiffBoot";

type QualityResult = {
  passed: boolean;
  score: number;
  reasons: string[];
  blur_variance: number;
  brightness: number;
  pose_yaw: number;
};

type EnrollStatus = {
  profileStatus: string;
  templateCount: number;
  required: number;
  canFinalize: boolean;
};

const REASON_LABELS: Record<string, string> = {
  BLUR: "ภาพเบลอ — กรุณาถือมือให้นิ่ง",
  FACE_TOO_SMALL: "ใบหน้าเล็กเกินไป — เข้าใกล้กล้องขึ้น",
  TOO_DARK: "แสงน้อยเกินไป — ไปอยู่ที่สว่างกว่านี้",
  TOO_BRIGHT: "แสงมากเกินไป — หลีกเลี่ยงแสงพื้นหลัง",
  POSE_YAW: "หันหน้าตรงขึ้น (ซ้าย-ขวา)",
  POSE_PITCH: "หันหน้าตรงขึ้น (บน-ล่าง)",
};

export default function LiffFaceRegisterPage() {
  const { status: liffStatus } = useLiff();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [enrollStatus, setEnrollStatus] = useState<EnrollStatus | null>(null);
  const [lastQuality, setLastQuality] = useState<QualityResult | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [done, setDone] = useState(false);

  const requestCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch {
      setCameraError("ไม่สามารถเปิดกล้องได้ — กรุณาอนุญาตการใช้กล้องให้ LINE");
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await apiFetch<EnrollStatus>("/attendance/enrollment/status");
      setEnrollStatus(s);
      if (s.profileStatus === "active") setDone(true);
    } catch {
      setEnrollStatus({ profileStatus: "none", templateCount: 0, required: 8, canFinalize: false });
    }
  }, []);

  useEffect(() => {
    if (liffStatus !== "ready") return;
    fetchStatus();
    requestCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (captureLoopRef.current) clearTimeout(captureLoopRef.current);
    };
  }, [liffStatus, requestCamera, fetchStatus]);

  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  const runCapture = useCallback(async () => {
    if (!cameraReady || capturing) return;
    const b64 = captureFrame();
    if (!b64) return;

    try {
      const res = await apiFetch<{
        success: boolean;
        quality?: QualityResult;
        reasons?: string[];
        templateCount?: number;
        required?: number;
        canFinalize?: boolean;
      }>("/attendance/enrollment/upload-frame", {
        method: "POST",
        body: JSON.stringify({ imageBase64: b64 }),
      });

      setLastQuality(res.quality ?? null);

      if (res.success) {
        toast.success(`ภาพผ่านแล้ว (${res.templateCount}/${res.required})`, { autoClose: 1200 });
        setEnrollStatus((prev) => ({
          profileStatus: prev?.profileStatus ?? "pending",
          templateCount: res.templateCount ?? (prev?.templateCount ?? 0) + 1,
          required: res.required ?? prev?.required ?? 8,
          canFinalize: res.canFinalize ?? false,
        }));
      } else {
        const reasonText = (res.reasons ?? [])
          .map((r) => REASON_LABELS[r] ?? r)
          .join(" / ");
        toast.warn(reasonText || "ภาพไม่ผ่านเกณฑ์ ลองใหม่", { autoClose: 1800 });
      }
    } catch {
      toast.error("เชื่อมต่อ server ไม่ได้");
    }
  }, [cameraReady, capturing, captureFrame]);

  const startLoop = useCallback(() => {
    setCapturing(true);
    const loop = async () => {
      if (!capturing) return;
      await runCapture();
      // Check if done after capture
      const latest = enrollStatus;
      if (latest && latest.templateCount >= latest.required) {
        setCapturing(false);
        return;
      }
      captureLoopRef.current = setTimeout(loop, 1800);
    };
    loop();
  }, [capturing, runCapture, enrollStatus]);

  const stopLoop = useCallback(() => {
    setCapturing(false);
    if (captureLoopRef.current) {
      clearTimeout(captureLoopRef.current);
      captureLoopRef.current = null;
    }
  }, []);

  const handleFinalize = async () => {
    if (!enrollStatus?.canFinalize) return;
    setFinalizing(true);
    try {
      await apiFetch("/attendance/enrollment/finalize", { method: "POST", body: "{}" });
      toast.success("ลงทะเบียนใบหน้าสำเร็จ!");
      setDone(true);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch (e: any) {
      toast.error(e.message ?? "ยืนยันไม่สำเร็จ");
    } finally {
      setFinalizing(false);
    }
  };

  if (liffStatus !== "ready") {
    return <div className="p-6 text-center text-sm text-slate-500">กำลังโหลด…</div>;
  }

  const required = enrollStatus?.required ?? 8;
  const count = enrollStatus?.templateCount ?? 0;
  const progressPct = Math.min(100, Math.round((count / required) * 100));

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <h1 className="mb-1 text-lg font-semibold">ลงทะเบียนใบหน้า (V2)</h1>
      <p className="mb-3 text-xs text-slate-500">
        ต้องถ่ายอย่างน้อย {required} ภาพ ในมุมต่างๆ — ระบบจะตรวจคุณภาพแต่ละภาพอัตโนมัติ
      </p>

      {done ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="mb-3 text-5xl">✓</div>
          <p className="mb-1 font-semibold text-emerald-800">ลงทะเบียนใบหน้าสำเร็จ</p>
          <p className="mb-4 text-sm text-emerald-700">ครบ {required} ภาพ — พร้อมใช้งานแล้ว</p>
          <Link
            href="/liff/checkin"
            className="inline-block rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white"
          >
            ไปลงเวลาเข้างาน →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Progress bar */}
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>ภาพที่ผ่านแล้ว</span>
              <span className="font-semibold">{count} / {required}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Camera */}
          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="block w-full"
              style={{ transform: "scaleX(-1)" }}
            />
            {/* Face guide oval */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-56 w-44 rounded-full border-2 border-white/60" />
            </div>
            <canvas ref={canvasRef} className="hidden" />
            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                กำลังเปิดกล้อง…
              </div>
            )}
          </div>

          {cameraError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs">
              <p className="mb-2 font-semibold text-rose-800">{cameraError}</p>
              <button onClick={requestCamera} className="w-full rounded-lg bg-rose-500 py-2 text-xs font-semibold text-white">
                ลองใหม่
              </button>
            </div>
          )}

          {/* Last quality feedback */}
          {lastQuality && !lastQuality.passed && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              {lastQuality.reasons.map((r) => REASON_LABELS[r] ?? r).join(" • ")}
            </div>
          )}

          {/* Guide tips */}
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p className="mb-1 font-semibold">ถ่ายแต่ละมุม:</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>หน้าตรง 3–4 ภาพ (แสงต่างกัน)</li>
              <li>หันซ้ายเล็กน้อย 2 ภาพ</li>
              <li>หันขวาเล็กน้อย 2 ภาพ</li>
            </ul>
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            {!capturing ? (
              <button
                onClick={startLoop}
                disabled={!cameraReady || count >= required}
                className="flex-1 rounded-lg bg-emerald-600 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                เริ่มถ่ายอัตโนมัติ
              </button>
            ) : (
              <button
                onClick={stopLoop}
                className="flex-1 rounded-lg bg-slate-600 py-3.5 text-sm font-semibold text-white"
              >
                หยุด
              </button>
            )}
            <button
              onClick={runCapture}
              disabled={!cameraReady || capturing}
              className="rounded-lg border border-slate-300 bg-white px-3 py-3.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              ถ่าย 1 ภาพ
            </button>
          </div>

          {enrollStatus?.canFinalize && (
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="w-full rounded-lg bg-blue-600 py-4 text-base font-semibold text-white active:scale-[0.98] disabled:opacity-50"
            >
              {finalizing ? "กำลังยืนยัน…" : `ยืนยัน Enrollment (${count} ภาพ)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
