"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import FaceCamera from "@/components/attendance/FaceCamera";
import { apiFetch } from "@/lib/api";

export default function FaceRegistrationPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleCapture(data: { imageBase64: string; latitude: number; longitude: number }) {
    setLoading(true);
    setResult(null);
    try {
      const res = await apiFetch<{ message: string; confidence: number }>("/attendance/register-face", {
        method: "POST",
        body: JSON.stringify({ imageBase64: data.imageBase64 }),
      });
      setResult({ success: true, message: `${res.message} (ความเชื่อมั่น: ${Math.round((res.confidence ?? 0) * 100)}%)` });
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : "เกิดข้อผิดพลาด" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/attendance" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> กลับ
      </Link>

      <h1 className="text-xl font-black text-primary mb-6">ลงทะเบียนใบหน้า</h1>

      <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm p-6">
        <p className="text-sm text-on-surface-variant mb-4 text-center">
          หันหน้าตรงไปที่กล้อง ให้เห็นใบหน้าชัดเจน แล้วกดปุ่มลงทะเบียน
        </p>

        <FaceCamera
          onCapture={handleCapture}
          buttonLabel="ลงทะเบียนใบหน้า"
          loading={loading}
        />

        {result && (
          <div className={`mt-4 p-4 rounded-xl flex items-center gap-3 ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
            {result.success ? (
              <CheckCircle size={20} className="text-green-600 shrink-0" />
            ) : (
              <XCircle size={20} className="text-red-600 shrink-0" />
            )}
            <p className={`text-sm font-medium ${result.success ? "text-green-800" : "text-red-800"}`}>
              {result.message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
