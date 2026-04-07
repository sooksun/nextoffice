"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, Loader2, MapPin, CheckCircle, XCircle } from "lucide-react";

interface FaceCameraProps {
  onCapture: (data: { imageBase64: string; latitude: number; longitude: number }) => Promise<void>;
  buttonLabel?: string;
  loading?: boolean;
}

export default function FaceCamera({ onCapture, buttonLabel = "ถ่ายภาพ", loading = false }: FaceCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Start camera
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreaming(true);
        }
      } catch (err) {
        setCameraError("ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง");
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Get GPS
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("เบราว์เซอร์ไม่รองรับ GPS");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsError(null);
      },
      (err) => {
        setGpsError("ไม่สามารถดึงตำแหน่งได้ กรุณาเปิด Location");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !gps) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);

    await onCapture({
      imageBase64,
      latitude: gps.lat,
      longitude: gps.lng,
    });
  }, [gps, onCapture]);

  const ready = streaming && gps && !loading;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Camera Preview */}
      <div className="relative w-full max-w-md aspect-[4/3] rounded-2xl overflow-hidden bg-black border-2 border-outline-variant/20">
        {cameraError ? (
          <div className="flex items-center justify-center h-full text-on-surface-variant text-sm p-4 text-center">
            <XCircle size={20} className="text-red-500 mr-2 shrink-0" />
            {cameraError}
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover mirror"
            style={{ transform: "scaleX(-1)" }}
          />
        )}
      </div>

      {/* GPS Status */}
      <div className="flex items-center gap-2 text-sm">
        <MapPin size={14} className={gps ? "text-emerald-500" : "text-red-500"} />
        {gps ? (
          <span className="text-emerald-600 font-medium">
            ตำแหน่ง: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
          </span>
        ) : gpsError ? (
          <span className="text-red-500">{gpsError}</span>
        ) : (
          <span className="text-on-surface-variant">กำลังค้นหาตำแหน่ง...</span>
        )}
      </div>

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

      {/* Hidden canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
