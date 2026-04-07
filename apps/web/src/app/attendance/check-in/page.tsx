"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import FaceCamera from "@/components/attendance/FaceCamera";
import { apiFetch } from "@/lib/api";

export default function CheckInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "out" ? "out" : "in";
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleCapture(data: { imageBase64: string; latitude: number; longitude: number }) {
    setLoading(true);
    setResult(null);
    try {
      const endpoint = mode === "out" ? "/attendance/check-out" : "/attendance/check-in";
      const res = await apiFetch<{ message: string }>(endpoint, {
        method: "POST",
        body: JSON.stringify(data),
      });
      setResult({ success: true, message: res.message || "สำเร็จ" });
      setTimeout(() => router.push("/attendance"), 2000);
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

      <h1 className="text-xl font-black text-primary mb-6">
        {mode === "out" ? "ลงเวลาออก" : "ลงเวลาเข้า"}
      </h1>

      <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm p-6">
        <p className="text-sm text-on-surface-variant mb-4 text-center">
          หันหน้าตรงไปที่กล้อง แล้วกดปุ่ม{mode === "out" ? "ลงเวลาออก" : "ลงเวลาเข้า"}
        </p>

        <FaceCamera
          onCapture={handleCapture}
          buttonLabel={mode === "out" ? "ลงเวลาออก" : "ลงเวลาเข้า"}
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
