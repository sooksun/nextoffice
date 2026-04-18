"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatThaiDateTime } from "@/lib/thai-date";
import {
  Globe,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

interface HorizonSource {
  id: number;
  sourceName: string;
  sourceType: string;
  trustLevel: number | null;
  lastFetchAt: string | null;
  isActive: boolean;
}

export default function HorizonSourcesPage() {
  const [sources, setSources] = useState<HorizonSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState<number | null>(null);

  useEffect(() => {
    loadSources();
  }, []);

  async function loadSources() {
    setLoading(true);
    try {
      const data = await apiFetch<HorizonSource[]>("/horizon/sources");
      setSources(data);
    } catch {
      setSources([]);
    } finally {
      setLoading(false);
    }
  }

  async function triggerFetch(sourceId: number) {
    setFetching(sourceId);
    try {
      await apiFetch(`/horizon/sources/${sourceId}/fetch`, { method: "POST" });
      await loadSources();
    } catch {
      // silently fail
    } finally {
      setFetching(null);
    }
  }

  function TrustBadge({ level }: { level: number | null }) {
    if (level == null) return <span className="text-outline text-xs">--</span>;
    const color =
      level >= 80
        ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300"
        : level >= 50
          ? "bg-amber-100 text-amber-700"
          : "bg-error-container text-on-error-container";
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}
      >
        {level}%
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
            แหล่งข้อมูล Horizon
          </h1>
          <p className="text-on-surface-variant mt-1">
            จัดการแหล่งข้อมูลภายนอกสำหรับ Horizon Scanning
          </p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : sources.length === 0 ? (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center text-outline shadow-sm">
          <Globe size={48} className="text-outline/30 mx-auto mb-4" />
          <h3 className="font-bold text-on-surface-variant mb-2">ยังไม่มีแหล่งข้อมูล</h3>
          <p className="text-sm text-outline">เพิ่มแหล่งข้อมูลจากระบบจัดการเพื่อเริ่มสแกนข้อมูล</p>
        </div>
      ) : (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-low border-b border-outline-variant/10">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ชื่อแหล่งข้อมูล</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ประเภท</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ความน่าเชื่อถือ</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ดึงข้อมูลล่าสุด</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สถานะ</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {sources.map((source) => (
                <tr key={source.id} className="hover:bg-surface-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface">{source.sourceName}</td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs">{source.sourceType}</td>
                  <td className="px-4 py-3">
                    <TrustBadge level={source.trustLevel} />
                  </td>
                  <td className="px-4 py-3 text-outline text-xs">
                    {formatThaiDateTime(source.lastFetchAt)}
                  </td>
                  <td className="px-4 py-3">
                    {source.isActive ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-bold">
                        <CheckCircle2 size={14} />
                        เปิดใช้งาน
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-outline text-xs font-bold">
                        <XCircle size={14} />
                        ปิดใช้งาน
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => triggerFetch(source.id)}
                      disabled={fetching === source.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {fetching === source.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                      ดึงข้อมูล
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
