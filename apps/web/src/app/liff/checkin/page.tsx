"use client";

import { useEffect, useRef, useState } from "react";
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

export default function LiffCheckinPage() {
  const { status: liffStatus } = useLiff();
  const searchParams = useSearchParams();
  const mode: Mode = (searchParams.get("mode") as Mode) === "out" ? "out" : "in";

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [today, setToday] = useState<TodayStatus | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [loadingTodayy, setLoadingToday] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch today's status
  useEffect(() => {
    if (liffStatus !== "ready") return;
    apiFetch<TodayStatus>("/attendance/today")
      .then(setToday)
      .catch(() => {})
      .finally(() => setLoadingToday(false));
  }, [liffStatus]);

  // Start camera + request GPS
  useEffect(() => {
    if (liffStatus !== "ready") return;
    if (result) return; // already done

    // Skip camera if already done today
    if (mode === "in" && today?.checkInAt) return;
    if (mode === "out" && today?.checkOutAt) return;

    (async () => {
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
        setError("กรุณาอนุญาตการใช้กล้องเพื่อลงเวลา");
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGps({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            acc: pos.coords.accuracy,
          });
        },
        () => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setGps({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                acc: pos.coords.accuracy,
              });
            },
            () => setError("กรุณาอนุญาตการใช้ตำแหน่งที่ตั้งเพื่อลงเวลา"),
            { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 },
          );
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    })();

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [liffStatus, today, mode, result]);

  const handleSubmit = async () => {
    if (!videoRef.current || !canvasRef.current || !gps) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);

    setSubmitting(true);
    setError(null);
    try {
      const endpoint = mode === "out" ? "/attendance/check-out" : "/attendance/check-in";
      const res = await apiFetch<CheckResult>(endpoint, {
        method: "POST",
        body: JSON.stringify({ imageBase64, latitude: gps.lat, longitude: gps.lng }),
      });
      setResult(res);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch (e: any) {
      setError(e.message ?? "ลงเวลาไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const alreadyDone =
    (mode === "in" && today?.checkInAt) || (mode === "out" && today?.checkOutAt);

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

      {loadingTodayy && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-500">
          กำลังโหลดสถานะวันนี้…
        </div>
      )}

      {/* Already done — show status */}
      {!loadingTodayy && alreadyDone && !result && (
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

      {/* Camera + capture */}
      {!loadingTodayy && !alreadyDone && !result && (
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
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                กำลังเปิดกล้อง…
              </div>
            )}
          </div>

          {/* Status chips */}
          <div className="flex gap-2 text-xs">
            <StatusChip ready={cameraReady} label="กล้อง" />
            <StatusChip ready={!!gps} label={gps ? `GPS (±${Math.round(gps.acc)}ม.)` : "GPS"} />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!cameraReady || !gps || submitting}
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
