"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, Loader2, MapPin, XCircle, RefreshCw, AlertTriangle } from "lucide-react";

interface FaceCameraProps {
  onCapture: (data: { imageBase64: string; latitude: number; longitude: number }) => Promise<void>;
  buttonLabel?: string;
  loading?: boolean;
}

export default function FaceCamera({ onCapture, buttonLabel = "ถ่ายภาพ", loading = false }: FaceCameraProps) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

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

    // Stop old stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!mountedRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("เบราว์เซอร์นี้ไม่รองรับกล้อง — ต้องเปิดผ่าน HTTPS");
      return;
    }

    // Check permission state first (Chrome/Edge/Firefox)
    try {
      const perm = await (navigator.permissions as any).query({ name: "camera" });
      if (perm.state === "denied") {
        setCameraError("denied");
        return;
      }
    } catch { /* permissions API not supported — proceed anyway */ }

    // Try with facingMode first, then plain video
    for (const constraint of [
      { video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } },
      { video: true },
    ] as MediaStreamConstraints[]) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraint);
        if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await new Promise<void>((resolve) => {
            const v = videoRef.current!;
            if (v.readyState >= 2) { resolve(); return; }
            v.onloadedmetadata = () => resolve();
            setTimeout(resolve, 3000);
          });
        }
        if (mountedRef.current) setStreaming(true);
        return;
      } catch (err: unknown) {
        const e = err as { name?: string };
        if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
          if (mountedRef.current) setCameraError("denied");
          return;
        }
        if (e?.name === "NotFoundError" || e?.name === "DevicesNotFoundError") {
          if (mountedRef.current) setCameraError("ไม่พบกล้องในอุปกรณ์นี้");
          return;
        }
        // OverconstrainedError → try next constraint
      }
    }
    if (mountedRef.current) setCameraError("กล้องอาจถูกใช้งานโดยแอปอื่น — ปิดแอปที่ใช้กล้องอยู่แล้วลองใหม่");
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); }
    };
  }, [startCamera]);

  // Auto-retry when user grants camera permission from the browser lock icon
  useEffect(() => {
    if (!navigator.permissions) return;
    let permStatus: PermissionStatus | null = null;
    (navigator.permissions as any).query({ name: "camera" }).then((ps: PermissionStatus) => {
      permStatus = ps;
      ps.onchange = () => {
        if (ps.state === "granted" && mountedRef.current) startCamera();
      };
    }).catch(() => {});
    return () => { if (permStatus) permStatus.onchange = null; };
  }, [startCamera]);

  // ─── GPS ─────────────────────────────────────────────────────────────────
  const requestGps = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("not_supported"); setGpsLoading(false); return;
    }
    setGpsLoading(true); setGpsError(null);

    const onSuccess = (pos: GeolocationPosition) => {
      if (!mountedRef.current) return;
      setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setGpsError(null); setGpsLoading(false);
    };
    const onFail = (err: GeolocationPositionError) => {
      if (!mountedRef.current) return;
      setGpsLoading(false);
      if (err.code === 1) setGpsError("denied");
      else if (err.code === 2) setGpsError("unavailable");
      else setGpsError("timeout");
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      () => navigator.geolocation.getCurrentPosition(
        onSuccess, onFail,
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 },
      ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  // Auto-retry when user grants location permission
  useEffect(() => {
    requestGps();
    if (!navigator.permissions) return;
    let permStatus: PermissionStatus | null = null;
    (navigator.permissions as any).query({ name: "geolocation" }).then((ps: PermissionStatus) => {
      permStatus = ps;
      ps.onchange = () => {
        if (ps.state === "granted" && mountedRef.current) requestGps();
      };
    }).catch(() => {});
    return () => { if (permStatus) permStatus.onchange = null; };
  }, [requestGps]);

  // ─── Capture ─────────────────────────────────────────────────────────────
  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !gps) return;
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    await onCapture({ imageBase64: c.toDataURL("image/jpeg", 0.85), latitude: gps.lat, longitude: gps.lng });
  }, [gps, onCapture]);

  const ready = streaming && gps && !loading;

  // ─── Camera error UI ─────────────────────────────────────────────────────
  const renderCameraError = () => {
    if (cameraError === "denied") {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center gap-3">
          <XCircle size={24} className="text-red-400 shrink-0" />
          <p className="text-red-300 text-sm font-semibold">กล้องถูกบล็อก</p>
          <div className="text-left bg-white/10 rounded-xl p-3 text-xs text-gray-200 leading-relaxed space-y-1">
            <p>1. คลิกไอคอน 🔒 ในแถบที่อยู่</p>
            <p>2. เลือก <strong>Camera → Allow</strong></p>
            <p>3. กดปุ่ม <strong>"โหลดหน้าใหม่"</strong> ด้านล่าง</p>
          </div>
          <div className="flex gap-2">
            <button onClick={startCamera}
              className="flex items-center gap-1 px-3 py-1.5 bg-white/10 text-white rounded-xl text-xs hover:bg-white/20 transition-colors">
              <RefreshCw size={12} /> ลองใหม่
            </button>
            <button onClick={() => window.location.reload()}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-xl text-xs hover:brightness-110 transition-colors">
              โหลดหน้าใหม่
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center gap-3">
        <XCircle size={24} className="text-red-400 shrink-0" />
        <p className="text-red-300 text-xs leading-relaxed">{cameraError}</p>
        <div className="flex gap-2">
          <button onClick={startCamera}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/10 text-white rounded-xl text-xs hover:bg-white/20 transition-colors">
            <RefreshCw size={12} /> ลองใหม่
          </button>
          <button onClick={() => window.location.reload()}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-xl text-xs hover:brightness-110 transition-colors">
            โหลดหน้าใหม่
          </button>
        </div>
      </div>
    );
  };

  // ─── GPS error UI ────────────────────────────────────────────────────────
  const renderGpsError = () => {
    if (gpsError === "denied") {
      return (
        <div className="w-full max-w-md p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-2">
          <p className="font-semibold">📍 ตำแหน่งถูกบล็อก — วิธีเปิด:</p>
          <ol className="list-decimal list-inside space-y-0.5 leading-relaxed">
            <li>คลิกไอคอน <strong>🔒</strong> ในแถบที่อยู่</li>
            <li>เลือก <strong>Location → Allow</strong></li>
            <li>รอสักครู่ — ระบบจะดึงตำแหน่งอัตโนมัติ</li>
          </ol>
          <button onClick={requestGps}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors">
            <RefreshCw size={10} /> ลองใหม่
          </button>
        </div>
      );
    }
    const msg: Record<string, string> = {
      unavailable: "ไม่สามารถระบุตำแหน่งได้ในขณะนี้",
      timeout: "หมดเวลาค้นหาตำแหน่ง",
      not_supported: "เบราว์เซอร์นี้ไม่รองรับ GPS",
    };
    return (
      <div className="w-full max-w-md flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
        <MapPin size={14} className="text-red-500 shrink-0" />
        <p className="text-xs text-red-700 flex-1">{msg[gpsError!] ?? gpsError}</p>
        <button onClick={requestGps}
          className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs hover:bg-red-200 shrink-0">
          <RefreshCw size={10} /> ลองใหม่
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Camera preview */}
      <div className="relative w-full max-w-md aspect-[4/3] rounded-2xl overflow-hidden bg-black border-2 border-outline-variant/20">
        {cameraError ? renderCameraError() :
         !streaming ? (
           <div className="flex flex-col items-center justify-center h-full gap-2">
             <Loader2 size={24} className="text-white/50 animate-spin" />
             <p className="text-white/40 text-xs">กำลังเปิดกล้อง...</p>
           </div>
         ) : (
           <video ref={videoRef} autoPlay playsInline muted
             className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
         )}
      </div>

      {/* GPS status */}
      {gps ? (
        <div className="flex items-center gap-2 text-xs text-emerald-600 w-full max-w-md">
          <MapPin size={14} className="text-emerald-500 shrink-0" />
          <span className="font-medium">ตำแหน่ง: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</span>
        </div>
      ) : gpsError ? renderGpsError() : gpsLoading ? (
        <div className="flex items-center gap-2 text-xs text-on-surface-variant w-full max-w-md">
          <Loader2 size={12} className="animate-spin shrink-0" />
          <span>กำลังค้นหาตำแหน่ง...</span>
        </div>
      ) : null}

      {!gps && !gpsError && streaming && !gpsLoading && (
        <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 w-full max-w-md">
          <AlertTriangle size={14} className="shrink-0" />
          รอสัญญาณ GPS — ปุ่มจะพร้อมใช้เมื่อพบตำแหน่ง
        </div>
      )}

      {/* Capture button */}
      <button onClick={capture} disabled={!ready}
        className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
        {loading ? "กำลังประมวลผล..." : buttonLabel}
      </button>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
