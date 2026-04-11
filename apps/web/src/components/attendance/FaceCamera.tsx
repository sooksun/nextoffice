"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, Loader2, MapPin, XCircle, RefreshCw, AlertTriangle } from "lucide-react";

interface FaceCameraProps {
  onCapture: (data: { imageBase64: string; latitude: number; longitude: number }) => Promise<void>;
  buttonLabel?: string;
  loading?: boolean;
}

export default function FaceCamera({ onCapture, buttonLabel = "ถ่ายภาพ", loading = false }: FaceCameraProps) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const mountedRef  = useRef(true);

  const [streaming,   setStreaming]   = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gps,         setGps]         = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError,    setGpsError]    = useState<string | null>(null);
  const [gpsLoading,  setGpsLoading]  = useState(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ─── Camera ───────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (!mountedRef.current) return;
    setCameraError(null);
    setStreaming(false);

    // Stop old tracks and wait for them to fully release
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      await new Promise((r) => setTimeout(r, 400));
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      if (mountedRef.current)
        setCameraError("เบราว์เซอร์นี้ไม่รองรับกล้อง — ต้องเปิดผ่าน HTTPS");
      return;
    }

    // Try with facingMode first, fall back to plain video: true
    const constraints: MediaStreamConstraints[] = [
      { video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } },
      { video: true },
    ];

    for (const constraint of constraints) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraint);
        if (!mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Wait for video metadata before marking as streaming
          await new Promise<void>((resolve) => {
            const v = videoRef.current!;
            if (v.readyState >= 2) { resolve(); return; }
            v.onloadedmetadata = () => resolve();
            setTimeout(resolve, 3000); // safety timeout
          });
        }
        if (mountedRef.current) setStreaming(true);
        return; // success
      } catch (err: unknown) {
        const e = err as { name?: string };
        // NotAllowed = no point trying next constraint; break immediately
        if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
          if (mountedRef.current)
            setCameraError("ถูกปฏิเสธการเข้าถึงกล้อง — กรุณาอนุญาตกล้องในการตั้งค่าเบราว์เซอร์แล้วกด 'ลองใหม่'");
          return;
        }
        if (e?.name === "NotFoundError" || e?.name === "DevicesNotFoundError") {
          if (mountedRef.current) setCameraError("ไม่พบกล้องในอุปกรณ์นี้");
          return;
        }
        // NotReadableError or OverconstrainedError → try next constraint
      }
    }

    if (mountedRef.current)
      setCameraError("ไม่สามารถเปิดกล้องได้ — กล้องอาจถูกใช้งานโดยแอปอื่น");
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
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

    const onSuccess = (pos: GeolocationPosition) => {
      if (!mountedRef.current) return;
      setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setGpsError(null);
      setGpsLoading(false);
    };

    const onError = (err: GeolocationPositionError) => {
      if (!mountedRef.current) return;
      setGpsLoading(false);
      if (err.code === 1 /* PERMISSION_DENIED */) {
        setGpsError("ถูกปฏิเสธการเข้าถึงตำแหน่ง — คลิกไอคอน 🔒 ในแถบที่อยู่ แล้วเปิด Location");
      } else if (err.code === 2 /* POSITION_UNAVAILABLE */) {
        setGpsError("ไม่สามารถระบุตำแหน่งได้ในขณะนี้");
      } else {
        setGpsError("หมดเวลาค้นหาตำแหน่ง");
      }
    };

    // Try high accuracy → fall back to low accuracy on error
    navigator.geolocation.getCurrentPosition(onSuccess,
      () => navigator.geolocation.getCurrentPosition(
        onSuccess, onError,
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 },
      ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => { requestGps(); }, [requestGps]);

  // ─── Capture ─────────────────────────────────────────────────────────────
  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !gps) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const imageBase64 = c.toDataURL("image/jpeg", 0.85);
    await onCapture({ imageBase64, latitude: gps.lat, longitude: gps.lng });
  }, [gps, onCapture]);

  const ready = streaming && gps && !loading;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Camera preview */}
      <div className="relative w-full max-w-md aspect-[4/3] rounded-2xl overflow-hidden bg-black border-2 border-outline-variant/20">
        {cameraError ? (
          <div className="flex flex-col items-center justify-center h-full text-sm p-4 text-center gap-3">
            <XCircle size={24} className="text-red-400 shrink-0" />
            <p className="text-red-300 text-xs leading-relaxed">{cameraError}</p>
            <button
              onClick={startCamera}
              className="flex items-center gap-1 px-4 py-2 bg-white/10 text-white rounded-xl text-xs hover:bg-white/20 transition-colors"
            >
              <RefreshCw size={12} /> ลองใหม่
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-1 px-4 py-2 bg-primary/80 text-white rounded-xl text-xs hover:bg-primary transition-colors"
            >
              โหลดหน้าใหม่
            </button>
          </div>
        ) : !streaming ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="text-white/50 animate-spin" />
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

      {/* GPS status */}
      <div className="w-full max-w-md">
        {gps ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <MapPin size={14} className="text-emerald-500 shrink-0" />
            <span className="font-medium text-xs">ตำแหน่ง: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</span>
          </div>
        ) : gpsError ? (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <MapPin size={14} className="text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-red-700 leading-relaxed">{gpsError}</p>
            </div>
            <button
              onClick={requestGps}
              className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs hover:bg-red-200 transition-colors shrink-0"
            >
              <RefreshCw size={10} /> ลองใหม่
            </button>
          </div>
        ) : gpsLoading ? (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <Loader2 size={12} className="animate-spin shrink-0" />
            <span>กำลังค้นหาตำแหน่ง...</span>
          </div>
        ) : null}
      </div>

      {/* Warning: camera ready but no GPS yet */}
      {!gps && !gpsError && streaming && !gpsLoading && (
        <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 w-full max-w-md">
          <AlertTriangle size={14} className="shrink-0" />
          รอสัญญาณ GPS — ปุ่มจะพร้อมใช้เมื่อพบตำแหน่ง
        </div>
      )}

      {/* Capture button */}
      <button
        onClick={capture}
        disabled={!ready}
        className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
        {loading ? "กำลังประมวลผล..." : buttonLabel}
      </button>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
