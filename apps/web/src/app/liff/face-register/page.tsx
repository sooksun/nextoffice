"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { useLiff } from "../LiffBoot";

export default function LiffFaceRegisterPage() {
  const { status: liffStatus } = useLiff();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);

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
      setCameraError("ไม่สามารถเปิดกล้องได้ — กรุณาอนุญาตการใช้กล้องให้ LINE ในการตั้งค่ามือถือ");
    }
  }, []);

  useEffect(() => {
    if (liffStatus !== "ready") return;
    apiFetch<{ registered: boolean }>("/attendance/face-status")
      .then((s) => setIsRegistered(s.registered))
      .catch(() => setIsRegistered(false));
    requestCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [liffStatus, requestCamera]);

  const handleRegister = async () => {
    if (!videoRef.current || !canvasRef.current || !cameraReady) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);

    setSubmitting(true);
    try {
      await apiFetch("/attendance/register-face", {
        method: "POST",
        body: JSON.stringify({ imageBase64 }),
      });
      setDone(true);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      toast.success("ลงทะเบียนใบหน้าสำเร็จ");
    } catch (e: any) {
      toast.error(e.message ?? "ลงทะเบียนไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  if (liffStatus !== "ready") {
    return <div className="p-6 text-center text-sm text-slate-500">กำลังโหลด…</div>;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <h1 className="mb-1 text-lg font-semibold">ลงทะเบียนใบหน้า</h1>
      <p className="mb-4 text-xs text-slate-500">
        ระบบใช้ใบหน้าเพื่อยืนยันตัวตนตอนลงเวลาเข้า-ออก — ถ่ายรูปใบหน้าชัดๆ ตรงแสง
      </p>

      {isRegistered && !done && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          คุณเคยลงทะเบียนใบหน้าแล้ว การถ่ายรูปใหม่จะ <b>แทนที่</b> ใบหน้าเดิม
        </div>
      )}

      {done ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="mb-3 text-4xl">✓</div>
          <p className="mb-1 font-semibold text-emerald-800">ลงทะเบียนใบหน้าสำเร็จ</p>
          <p className="mb-4 text-sm text-emerald-700">ตอนนี้สามารถลงเวลาเข้า-ออกงานได้แล้ว</p>
          <Link
            href="/liff/checkin"
            className="inline-block rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white"
          >
            ไปลงเวลาเข้างาน →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="block w-full"
              style={{ transform: "scaleX(-1)" }}
            />
            <canvas ref={canvasRef} className="hidden" />
            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                กำลังเปิดกล้อง…
              </div>
            )}
          </div>

          {cameraError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs">
              <p className="mb-2 font-semibold text-rose-800">⚠ {cameraError}</p>
              <button
                onClick={requestCamera}
                className="w-full rounded-lg bg-rose-500 py-2 text-xs font-semibold text-white"
              >
                ลองใหม่
              </button>
            </div>
          )}

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p className="mb-1 font-semibold">คำแนะนำ:</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>มองตรงกล้อง ให้ใบหน้าอยู่กลางภาพ</li>
              <li>อยู่ในที่แสงสว่างเพียงพอ</li>
              <li>ไม่สวมหมวก/แว่นกันแดด</li>
            </ul>
          </div>

          <button
            onClick={handleRegister}
            disabled={!cameraReady || submitting}
            className="w-full rounded-lg bg-emerald-600 py-4 text-base font-semibold text-white active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "กำลังลงทะเบียน…" : "📸 ถ่ายรูปและลงทะเบียนใบหน้า"}
          </button>
        </div>
      )}
    </div>
  );
}
