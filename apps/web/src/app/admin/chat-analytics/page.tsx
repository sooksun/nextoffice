"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Database,
  Target,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

// ─── types ────────────────────────────────────────────────────────────────────

interface FeedbackStats {
  rangeDays: number;
  up: number;
  down: number;
  total: number;
  satisfactionRate: number;
}

interface CacheStats {
  totalEntries: number;
  totalHits: number;
  avgHitCount: number;
  topHits: Array<{ normalizedQuery: string; hitCount: number; lastHitAt: string | null }>;
}

interface OverviewResponse {
  feedback: FeedbackStats;
  cache: CacheStats;
}

interface TopNegativeRow {
  userQuery: string | null;
  pageRoute: string | null;
  downCount: number;
}

interface StatsByPageRow {
  pageRoute: string;
  up: number;
  down: number;
  total: number;
  satisfactionRate: number;
}

interface RecentFeedbackRow {
  id: number;
  queryId: string;
  rating: "up" | "down";
  userQuery: string | null;
  answerPreview: string | null;
  pageRoute: string | null;
  createdAt: string;
}

const RANGE_OPTIONS = [
  { label: "7 วัน", value: 7 },
  { label: "30 วัน", value: 30 },
  { label: "90 วัน", value: 90 },
];

// ─── page ─────────────────────────────────────────────────────────────────────

export default function ChatAnalyticsPage() {
  const [rangeDays, setRangeDays] = useState(30);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [topNegative, setTopNegative] = useState<TopNegativeRow[]>([]);
  const [byPage, setByPage] = useState<StatsByPageRow[]>([]);
  const [recent, setRecent] = useState<RecentFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, tn, bp, rc] = await Promise.all([
        apiFetch<OverviewResponse>(`/chat/admin/overview?days=${rangeDays}`),
        apiFetch<TopNegativeRow[]>(`/chat/admin/feedback/top-negative?days=${rangeDays}&limit=15`),
        apiFetch<StatsByPageRow[]>(`/chat/admin/feedback/by-page?days=${rangeDays}`),
        apiFetch<RecentFeedbackRow[]>(`/chat/admin/feedback/recent?limit=20`),
      ]);
      setOverview(ov);
      setTopNegative(tn);
      setByPage(bp);
      setRecent(rc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [rangeDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const fb = overview?.feedback;
  const cache = overview?.cache;
  const satPct = fb ? Math.round(fb.satisfactionRate * 100) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-on-surface flex items-center gap-2">
            <Sparkles className="text-primary" size={22} />
            Chat Analytics
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Feedback, cache stats และคำถามที่ยังตอบได้ไม่ดี
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-surface-low rounded-xl p-0.5 border border-outline-variant/20">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRangeDays(opt.value)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  rangeDays === opt.value
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:bg-surface-high"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-xl bg-surface-low border border-outline-variant/20 hover:bg-surface-high transition-colors disabled:opacity-50"
            aria-label="รีเฟรช"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={MessageSquare}
          label="Feedback ทั้งหมด"
          value={fb?.total ?? 0}
          detail={fb ? `${rangeDays} วันล่าสุด` : ""}
          color="primary"
          loading={loading && !overview}
        />
        <StatCard
          icon={Target}
          label="Satisfaction"
          value={fb && fb.total > 0 ? `${satPct}%` : "—"}
          detail={fb ? `${fb.up} 👍 / ${fb.down} 👎` : ""}
          color={satPct >= 80 ? "good" : satPct >= 60 ? "warn" : "bad"}
          loading={loading && !overview}
        />
        <StatCard
          icon={Database}
          label="Cache entries"
          value={cache?.totalEntries ?? 0}
          detail={cache ? `เฉลี่ย ${cache.avgHitCount.toFixed(1)} hits/entry` : ""}
          color="secondary"
          loading={loading && !overview}
        />
        <StatCard
          icon={TrendingUp}
          label="Cache hits รวม"
          value={cache?.totalHits ?? 0}
          detail="ประหยัด Gemini call จำนวนเท่านี้"
          color="tertiary"
          loading={loading && !overview}
        />
      </div>

      {/* Two-column: Top 👎 + Satisfaction per page */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Top 👎 queries */}
        <section className="bg-surface-low border border-outline-variant/10 rounded-2xl p-4">
          <h2 className="font-black text-sm flex items-center gap-1.5 mb-3">
            <ThumbsDown size={14} className="text-rose-500" />
            Top คำถามที่ตอบได้ไม่ดี
            <span className="text-[10px] font-normal text-outline">(candidate สำหรับขยายฐานความรู้)</span>
          </h2>
          {topNegative.length === 0 ? (
            <EmptyRow label="ยังไม่มี feedback 👎 ในช่วงนี้" />
          ) : (
            <div className="space-y-1.5">
              {topNegative.map((r, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 px-3 py-2 bg-surface border border-outline-variant/10 rounded-xl hover:border-outline-variant/30 transition-colors"
                >
                  <span className="w-5 h-5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    {r.downCount}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-on-surface line-clamp-2">
                      {r.userQuery ?? "(ไม่มีข้อความ)"}
                    </p>
                    {r.pageRoute && (
                      <p className="text-[10px] font-mono text-outline mt-0.5 truncate">{r.pageRoute}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Satisfaction per page */}
        <section className="bg-surface-low border border-outline-variant/10 rounded-2xl p-4">
          <h2 className="font-black text-sm flex items-center gap-1.5 mb-3">
            <Target size={14} className="text-primary" />
            Satisfaction รายหน้า
            <span className="text-[10px] font-normal text-outline">(min 3 feedback)</span>
          </h2>
          {byPage.length === 0 ? (
            <EmptyRow label="ยังไม่มี feedback มากพอต่อหน้า" />
          ) : (
            <div className="space-y-1.5">
              {byPage.map((r, i) => {
                const pct = Math.round(r.satisfactionRate * 100);
                const tone = pct >= 80 ? "emerald" : pct >= 60 ? "amber" : "rose";
                return (
                  <div
                    key={i}
                    className="px-3 py-2 bg-surface border border-outline-variant/10 rounded-xl"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-mono text-on-surface truncate flex-1 min-w-0 pr-2">
                        {r.pageRoute}
                      </p>
                      <span className={`text-xs font-black text-${tone}-600 shrink-0 tabular-nums`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-surface-high rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-${tone}-500 transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-outline tabular-nums shrink-0">
                        {r.up}👍 {r.down}👎
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Top cache hits */}
      {cache && cache.topHits.length > 0 && (
        <section className="bg-surface-low border border-outline-variant/10 rounded-2xl p-4 mb-6">
          <h2 className="font-black text-sm flex items-center gap-1.5 mb-3">
            <Database size={14} className="text-secondary" />
            Top คำถามใน cache
            <span className="text-[10px] font-normal text-outline">(ถูกถามซ้ำมากสุด)</span>
          </h2>
          <div className="space-y-1">
            {cache.topHits.map((h, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface rounded-lg"
              >
                <span className="w-5 h-5 rounded-md bg-secondary-fixed/40 text-secondary text-[10px] font-black flex items-center justify-center shrink-0">
                  {h.hitCount}
                </span>
                <p className="flex-1 min-w-0 truncate">{h.normalizedQuery}</p>
                {h.lastHitAt && (
                  <span className="text-[10px] text-outline shrink-0 tabular-nums">
                    {new Date(h.lastHitAt).toLocaleDateString("th-TH")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent feedback */}
      <section className="bg-surface-low border border-outline-variant/10 rounded-2xl p-4">
        <h2 className="font-black text-sm flex items-center gap-1.5 mb-3">
          <MessageSquare size={14} className="text-on-surface" />
          Feedback ล่าสุด
        </h2>
        {recent.length === 0 ? (
          <EmptyRow label="ยังไม่มี feedback เข้ามา" />
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-2 px-3 py-2 bg-surface border border-outline-variant/10 rounded-xl"
              >
                <div
                  className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${
                    r.rating === "up" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                  }`}
                >
                  {r.rating === "up" ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-on-surface line-clamp-1">
                    {r.userQuery ?? "(ไม่มีคำถาม)"}
                  </p>
                  {r.answerPreview && (
                    <p className="text-[11px] text-on-surface-variant line-clamp-2 mt-0.5">
                      {r.answerPreview}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-outline">
                    {r.pageRoute && <span className="font-mono">{r.pageRoute}</span>}
                    <span>•</span>
                    <span>{new Date(r.createdAt).toLocaleString("th-TH")}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  color,
  loading,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number | string;
  detail?: string;
  color: "primary" | "secondary" | "tertiary" | "good" | "warn" | "bad";
  loading?: boolean;
}) {
  const iconColor = {
    primary: "text-primary bg-primary-fixed/40",
    secondary: "text-secondary bg-secondary-fixed/40",
    tertiary: "text-tertiary bg-tertiary-fixed/40",
    good: "text-emerald-600 bg-emerald-100",
    warn: "text-amber-600 bg-amber-100",
    bad: "text-rose-600 bg-rose-100",
  }[color];

  return (
    <div className="bg-surface-low border border-outline-variant/10 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${iconColor}`}>
          <Icon size={14} />
        </div>
        <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
          {label}
        </span>
      </div>
      {loading ? (
        <div className="h-8 bg-surface-high rounded animate-pulse" />
      ) : (
        <p className="text-3xl font-black text-on-surface tabular-nums">{value}</p>
      )}
      {detail && <p className="text-[11px] text-outline mt-1">{detail}</p>}
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="py-6 text-center text-xs text-outline">{label}</div>
  );
}
