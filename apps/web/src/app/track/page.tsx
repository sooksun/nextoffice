"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Search } from "lucide-react";

export default function TrackIndexPage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    router.push(`/track/${trimmed}`);
  };

  return (
    <div className="max-w-lg mx-auto py-12 px-4">
      <div className="flex flex-col items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <QrCode size={32} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">ติดตามเอกสาร</h1>
        <p className="text-sm text-on-surface-variant text-center">
          กรอกรหัสติดตามจาก QR Code เพื่อดูสถานะเอกสาร
        </p>
      </div>

      <form onSubmit={handleSearch} className="space-y-4">
        <div className="relative">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="วางรหัสติดตาม เช่น a1b2c3d4-..."
            className="w-full px-4 py-3 pr-12 rounded-2xl border border-outline-variant text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/70" />
        </div>
        <button
          type="submit"
          className="w-full py-3 bg-primary text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          <Search size={16} /> ค้นหา
        </button>
      </form>
    </div>
  );
}
