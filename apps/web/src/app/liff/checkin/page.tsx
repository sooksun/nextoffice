"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useLiff } from "../LiffBoot";

type Mode = "in" | "out";

interface TodayStatus {
  date: string;
  status: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  faceMatchScore: number | null;
  geofenceValid: boolean | null;
}

interface CheckResult {
  id: number;
  checkInAt?: string;
  checkOutAt?: string;
  status: string;
  faceMatchScore: number | null;
  geofenceValid: boolean;
  distance: number | null;
  message: string;
}

const STATUS_LABEL: Record<string, string> = {
  checked_in: "ลงเวลาเข้าแล้ว",
  checked_out: "ลงเวลาออกแล้ว",
  late: "มาสาย",
  absent: "ไม่มา",
  leave: "ลา",
  travel: "ไปราชการ",
};

type GpsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; lat: number; lng: number; acc: number }
  | { status: "denied"; message: string }
  | { status: "unsupported"; message: string };

export default function LiffCheckinPage() {
  const { status: liffStatus } = useLiff();
  const searchParams = useSearchParams();
  const queryMode = searchParams.get("mode");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [today, setToday] = useState<TodayStatus | null>(null);
  const [mode, setMode] = useState<Mode>("in");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsState>({ status: "idle" });
  const [loadingToday, setLoadingToday] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auto-detect mode from today's status (unless explicitly given via query)
  useEffect(() => {
    if (queryMode === "in" || queryMode === "out") {
      setMode(queryMode);
      return;
    }
    if (!today) return;
    // Default rule: if already checked in but not out → "out", else "in"
    if (today.checkInAt && !today.checkOutAt) setMode("out");
    else setMode("in");
  }, [today, queryMode]);

  // Fetch today's status
  useEffect(() => {
    if (liffStatus !== "ready") return;
    apiFetch<TodayStatus>("/attendance/today")
      .then(setToday)
      .catch(() => {})
      .finally(() => setLoadingToday(false));
  }, [liffStatus]);

  // Request GPS with sensible fallback (high → low accuracy)
  const requestGps = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGps({
        status: "unsupported",
        message: "อุปกรณ์ไม่รองรับการอ่านตำแหน่งที่ตั้ง",
      });
      return;
    }
    setGps({ status: "loading" });

    const onSuccess = (pos: GeolocationPosition) => {
      setGps({
        status: "ready",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
      });
    };

    const onLowAccuracyFail = (err: GeolocationPositionError) => {
      const code = err.code;
      const msg =
        code === 1
          ? "คุณปฏิเสธการให้สิทธิ์เข้าถึงตำแหน่งที่ตั้ง"
          : code === 3
            ? "อ่านตำแหน่งไม่สำเร็จ (หมดเวลา)"
            : "อ่านตำแหน่งไม่สำเร็จ";
      setGps({ status: "denied", message: msg });
    };

    const onHighFail = () => {
      // Retry with lower accuracy
      navigator.geolocation.getCurrentPosition(onSuccess, onLowAccuracyFail, {
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 60000,
      });
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onHighFail, {
      enableHighAccuracy: true,
      timeout: 10000,
    });
  }, []);

  // Request camera
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
    } catch (e: any) {
      setCameraError(
        "ไม่สามารถเปิดกล้องได้ — กรุณาอนุญาตการใช้กล้องให้ LINE ในการตั้งค่ามือถือ",
      );
    }
  }, []);

  // Open the checkin page in external browser (bypasses LINE in-app browser restrictions)
  const openInExternalBrowser = async () => {
    try {
      const liffModule = await import("@line/liff");
      const liff = liffModule.default;
      const url = `${window.location.origin}/liff/checkin?mode=${mode}`;
      if (liff.openWindow) {
        liff.openWindow({ url, external: true });
        return;
      }
    } catch {
      /* fall through */
    }
    window.open(
      `${window.location.origin}/liff/checkin?mode=${mode}`,
      "_blank",
      "noopener",
    );
  };

  const alreadyDone =
    (mode === "in" && today?.checkInAt) || (mode === "out" && today?.checkOutAt);

  // Start camera + GPS once we know mode and today's status (skip if already done)
  useEffect(() => {
    if (liffStatus !== "ready") return;
    if (result || alreadyDone || loadingToday) return;
    requestCamera();
    requestGps();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [liffStatus, result, alreadyDone, loadingToday, requestCamera, requestGps]);

  const handleSubmit = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (gps.status !== "ready") return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);

    setSubmitting(true);
    setSubmitError(null);
    try {
      const endpoint = mode === "out" ? "/attendance/check-out" : "/attendance/check-in";
      const res = await apiFetch<CheckResult>(endpoint, {
        method: "POST",
        body: JSON.stringify({ imageBase64, latitude: gps.lat, longitude: gps.lng }),
      });
      setResult(res);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch (e: any) {
      setSubmitError(e.message ?? "ลงเวลาไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <h1 className="mb-1 text-lg font-semibold">
        {mode === "out" ? "ลงเวลาออก" : "ลงเวลาเข้า"}
      </h1>
      <p className="mb-4 text-xs text-slate-500">
        ใช้กล้องและตำแหน่งที่ตั้งเพื่อยืนยันการลงเวลา
      </p>

      {loadingToday && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-500">
          กำลังโหลดสถานะวันนี้…
        </div>
      )}

      {/* Already done */}
      {!loadingToday && alreadyDone && !result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
          <div className="mb-2 text-2xl">✓</div>
          <p className="mb-1 font-semibold text-emerald-800">
            {mode === "out" ? "ลงเวลาออกแล้ว" : "ลงเวลาเข้าแล้ว"}
          </p>
          <p className="text-sm text-emerald-700">
            เวลา:{" "}
            {new Date(
              (mode === "out" ? today?.checkOutAt : today?.checkInAt) ?? "",
            ).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {today?.status && (
            <p className="mt-1 text-xs text-emerald-700">
              สถานะ: {STATUS_LABEL[today.status] ?? today.status}
            </p>
          )}
          {mode === "in" && !today?.checkOutAt && (
            <Link
              href="/liff/checkin?mode=out"
              className="mt-4 block rounded-lg bg-emerald-600 py-3 text-center text-sm font-semibold text-white"
            >
              ลงเวลาออกงาน →
            </Link>
          )}
        </div>
      )}

      {/* Success result */}
      {result && (
        <div
          className={`rounded-lg p-6 ${
            result.geofenceValid
              ? "border border-emerald-200 bg-emerald-50"
              : "border border-amber-200 bg-amber-50"
          }`}
        >
          <div className="mb-2 text-2xl">{result.geofenceValid ? "✓" : "⚠"}</div>
          <p className="mb-2 font-semibold text-slate-800">{result.message}</p>
          <dl className="space-y-1 text-xs text-slate-600">
            <div>
              <dt className="inline font-medium">เวลา: </dt>
              <dd className="inline">
                {new Date(
                  (result.checkOutAt ?? result.checkInAt) ?? "",
                ).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
              </dd>
            </div>
            {result.faceMatchScore !== null && (
              <div>
                <dt className="inline font-medium">ความตรงใบหน้า: </dt>
                <dd className="inline">{(result.faceMatchScore * 100).toFixed(1)}%</dd>
              </div>
            )}
            {result.distance !== null && (
              <div>
                <dt className="inline font-medium">ระยะจากที่ทำงาน: </dt>
                <dd className="inline">{result.distance} ม.</dd>
              </div>
            )}
          </dl>
          <Link
            href="/liff"
            className="mt-4 block rounded-lg bg-slate-100 py-3 text-center text-sm font-semibold text-slate-700"
          >
            กลับหน้าแรก
          </Link>
        </div>
      )}

      {/* Camera + capture UI */}
      {!loadingToday && !alreadyDone && !result && (
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

          {/* Status chips */}
          <div className="flex gap-2 text-xs">
            <StatusChip ready={cameraReady} label="กล้อง" />
            <StatusChip
              ready={gps.status === "ready"}
              label={
                gps.status === "ready"
                  ? `GPS (±${Math.round(gps.acc)}ม.)`
                  : gps.status === "loading"
                    ? "กำลังขอ GPS…"
                    : "GPS"
              }
            />
          </div>

          {/* Camera error */}
          {cameraError && (
            <PermissionError
              title="กล้องไม่พร้อม"
              message={cameraError}
              onRetry={requestCamera}
            />
          )}

          {/* GPS error — with iOS-specific guidance */}
          {gps.status === "denied" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
              <p className="mb-2 font-semibold text-amber-800">⚠ {gps.message}</p>
              <div className="mb-2 space-y-1 text-amber-700">
                <p className="font-medium">วิธีแก้:</p>
                <p>
                  <b>iOS:</b> Settings → LINE → Location → <b>While Using the App</b>
                </p>
                <p>
                  <b>Android:</b> ตั้งค่า → แอพ → LINE → สิทธิ์ → ตำแหน่ง → <b>อนุญาต</b>
                </p>
                <p className="mt-2">ถ้าแก้ไขแล้วกดลองใหม่:</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={requestGps}
                  className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white"
                >
                  🔄 ลองใหม่
                </button>
                <button
                  onClick={openInExternalBrowser}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  🌐 เปิดในเบราว์เซอร์
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                * เปิดในเบราว์เซอร์ภายนอก (Safari / Chrome) อาจขออนุญาตได้สำเร็จ
              </p>
            </div>
          )}

          {gps.status === "unsupported" && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {gps.message}
            </div>
          )}

          {submitError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {submitError}
              {submitError.includes("No face registered") && (
                <Link
                  href="/liff/face-register"
                  className="mt-2 block w-full rounded-lg bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white"
                >
                  ลงทะเบียนใบหน้าก่อนใช้งาน →
                </Link>
              )}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!cameraReady || gps.status !== "ready" || submitting}
            className={`w-full rounded-lg py-4 text-base font-semibold text-white active:scale-[0.98] disabled:opacity-50 ${
              mode === "out" ? "bg-indigo-600" : "bg-emerald-600"
            }`}
          >
            {submitting
              ? "กำลังบันทึก…"
              : mode === "out"
                ? "📸 ถ่ายรูปและลงเวลาออก"
                : "📸 ถ่ายรูปและลงเวลาเข้า"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusChip({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span
      className={`flex-1 rounded px-2 py-1 text-center ${
        ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {ready ? "✓ " : "○ "}
      {label}
    </span>
  );
}

function PermissionError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs">
      <p className="mb-1 font-semibold text-rose-800">⚠ {title}</p>
      <p className="mb-2 text-rose-700">{message}</p>
      <button
        onClick={onRetry}
        className="w-full rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white"
      >
        🔄 ลองใหม่
      </button>
    </div>
  );
}
