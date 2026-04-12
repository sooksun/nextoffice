"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  onSignature: (base64: string) => void;
  width?: number;
  height?: number;
}

export default function SignaturePad({ onSignature, width = 400, height = 160 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  // High-DPI support
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1254B1"; // stamp blue
  }, [width, height, dpr]);

  const getPos = useCallback(
    (e: React.PointerEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDrawing(true);
      setHasStrokes(true);
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    },
    [getPos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    [drawing, getPos],
  );

  const onPointerUp = useCallback(() => {
    setDrawing(false);
    // Export signature
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base64 = canvas.toDataURL("image/png");
    onSignature(base64);
  }, [onSignature]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    setHasStrokes(false);
    onSignature("");
  }, [width, height, onSignature]);

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border-2 border-dashed border-outline-variant/40 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          className="cursor-crosshair"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {!hasStrokes && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-outline/40">ลงนามที่นี่</p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-error transition-colors"
      >
        <Eraser size={14} />
        ล้างลายเซ็น
      </button>
    </div>
  );
}
