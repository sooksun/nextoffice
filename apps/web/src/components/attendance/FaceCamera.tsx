"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, Loader2, MapPin, XCircle, RefreshCw, AlertTriangle } from "lucide-react";

interface FaceCameraProps {
  onCapture: (data: { imageBase64: string; latitude: number; longitude: number }) => Promise<void>;
  buttonLabel?: string;
  loading?: boolean;
}

export default function FaceCamera({ onCapture, buttonLabel = "ถ่ายภาพ", loading = false }: FaceCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ─── Camera ───────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setStreaming(false);

    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("เบราว์เซอร์นี้ไม่รองรับการใช้งานกล้อง (ต้องเป็น HTTPS)");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreaming(true);
      }
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
        setCameraError("ถูกปฏิเสธการเข้าถึงกล้อง — กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์แล้วโหลดหน้าใหม่");
      } else if (e?.name === "NotFoundError" || e?.name === "DevicesNotFoundError") {
        setCameraError("ไม่พบกล้องในอุปกรณ์นี้");
      } else {
        setCameraError("ไม่สามารถเปิดกล้องได้ — กรุณาตรวจสอบการอนุญาตกล้องในเบราว์เซอร์");
      }
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCamera]);

  // ─── GPS ─────────────────────────────────────────────────────────────────
  const requestGps = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("เบราว์เซอร์นี้ไม่รองรับ GPS");
      setGpsLoading(false);
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    // Try high accuracy first, fall back to low accuracy
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsError(null);
        setGpsLoading(false);
      },
      () => {
        // High accuracy failed — try low accuracy
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setGpsError(null);
            setGpsLoading(false);
          },
          (err) => {
            setGpsLoading(false);
            if (err.code === 1) {
              setGpsError("ถูกปฏิเสธการเข้าถึงตำแหน่ง — กรุณาเปิด Location ในเบราว์เซอร์");
            } else if (err.code === 2) {
              setGpsError("ไม่สามารถระบุตำแหน่งได้ในขณะนี้");
            } else {
              setGpsError("หมดเวลาค้นหาตำแหน่ง — กรุณาลองใหม่");
            }
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 },
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    requestGps();
  }, [requestGps]);

  // ─── Capture ─────────────────────────────────────────────────────────────
  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (!gps) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);
    await onCapture({ imageBase64, latitude: gps.lat, longitude: gps.lng });
  }, [gps, onCapture]);

  const ready = streaming && gps && !loading;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Camera Preview */}
      <div className="relative w-full max-w-md aspect-[4/3] rounded-2xl overflow-hidden bg-black border-2 border-outline-variant/20">
        {cameraError ? (
          <div className="flex flex-col items-center justify-center h-full text-sm p-4 text-center gap-3">
            <XCircle size={24} className="text-red-500 shrink-0" />
            <p className="text-red-300">{cameraError}</p>
            <button
              onClick={startCamera}
              className="flex items-center gap-1 px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition-colors"
            >
              <RefreshCw size={12} /> ลองใหม่
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        )}
      </div>

      {/* GPS Status */}
      <div className="flex items-center gap-2 text-sm">
        <MapPin size={14} className={gps ? "text-emerald-500" : gpsError ? "text-red-500" : "text-yellow-500"} />
        {gps ? (
          <span className="text-emerald-600 font-medium">
            ตำแหน่ง: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
          </span>
        ) : gpsError ? (
          <div className="flex items-center gap-2">
            <span className="text-red-500 text-xs">{gpsError}</span>
            <button
              onClick={requestGps}
              className="flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100 transition-colors border border-red-200"
            >
              <RefreshCw size={10} /> ลองใหม่
            </button>
          </div>
        ) : gpsLoading ? (
          <span className="text-on-surface-variant flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> กำลังค้นหาตำแหน่ง...
          </span>
        ) : null}
      </div>

      {/* GPS warning — camera ok but no GPS yet */}
      {!gps && !gpsError && streaming && (
        <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
          <AlertTriangle size={14} className="shrink-0" />
          รอสัญญาณ GPS อยู่ — ปุ่มจะพร้อมใช้เมื่อพบตำแหน่ง
        </div>
      )}

      {/* Capture Button */}
      <button
        onClick={capture}
        disabled={!ready}
        className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Camera size={18} />
        )}
        {loading ? "กำลังประมวลผล..." : buttonLabel}
      </button>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
