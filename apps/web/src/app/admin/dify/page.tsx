"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toastError, toastSuccess } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";

interface Overview {
  enabled: boolean;
  configured: boolean;
  apiBase: string | null;
  phase?: number;
  apps?: {
    chat?: boolean;
    workflow?: boolean;
    completion?: boolean;
    outboundOutline?: boolean;
  };
  tools?: {
    enabled?: boolean;
    keyConfigured?: boolean;
    defaultOrgId?: number | null;
  };
  cache?: { answerCacheEnabled?: boolean; answerCacheSize?: number };
  rateLimit?: { chatPerUser?: number; toolsPerOrg?: number };
  ops?: {
    toolsRateLimit?: number;
    toolsRateWindowMs?: number;
    toolsIpAllowlistConfigured?: boolean;
    toolsKeyFingerprint?: string | null;
  };
  audit?: {
    bufferSize?: number;
    maxBuffer?: number;
    ok?: number;
    failed?: number;
    byKind?: Record<string, number>;
  };
  docs?: string[];
}

interface AuditEvent {
  id: string;
  at: string;
  kind: string;
  action: string;
  organizationId?: number | null;
  userKey?: string | null;
  ok: boolean;
  statusCode?: number;
  latencyMs?: number;
  detail?: string;
  ip?: string | null;
}

export default function AdminDifyPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, au] = await Promise.all([
        apiFetch<Overview>("/dify/admin/overview"),
        apiFetch<{ events: AuditEvent[] }>(
          `/dify/admin/audit?limit=80${kind ? `&kind=${kind}` : ""}`,
        ),
      ]);
      setOverview(ov);
      setEvents(au.events ?? []);
    } catch (e: unknown) {
      toastError(getErrorMessage(e, "โหลด Dify admin ไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearAudit = async () => {
    if (!confirm("ล้าง audit buffer ในหน่วยความจำ?")) return;
    try {
      await apiFetch("/dify/admin/audit/clear", { method: "POST" });
      toastSuccess("ล้าง audit แล้ว");
      void load();
    } catch (e: unknown) {
      toastError(getErrorMessage(e, "ล้างไม่สำเร็จ"));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-primary">
            <Sparkles size={22} /> Dify Ops
          </h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Phase 6 — สถานะการเชื่อมต่อ, rate limit, audit (in-memory) · ADMIN / DIRECTOR
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-semibold"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            รีเฟรช
          </button>
          <Link
            href="/dify"
            className="inline-flex items-center rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white"
          >
            เปิด /dify
          </Link>
        </div>
      </div>

      {loading && !overview ? (
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="animate-spin" size={16} /> กำลังโหลด…
        </div>
      ) : overview ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Dify enabled"
              ok={overview.enabled}
              value={overview.enabled ? "ON" : "OFF"}
            />
            <Stat
              label="Chat configured"
              ok={!!overview.apps?.chat}
              value={overview.apps?.chat ? "yes" : "no"}
            />
            <Stat
              label="Tools key"
              ok={!!overview.tools?.keyConfigured}
              value={overview.ops?.toolsKeyFingerprint ?? "—"}
            />
            <Stat
              label="Audit buffer"
              ok={(overview.audit?.failed ?? 0) === 0}
              value={`${overview.audit?.ok ?? 0} ok / ${overview.audit?.failed ?? 0} fail`}
            />
          </div>

          <div className="rounded-2xl border border-outline-variant/25 bg-surface-lowest p-4 text-sm">
            <h2 className="mb-3 font-bold text-on-surface">Apps & ops</h2>
            <dl className="grid gap-2 sm:grid-cols-2">
              <Row k="API base" v={overview.apiBase ?? "—"} />
              <Row k="Phase" v={String(overview.phase ?? "—")} />
              <Row k="Workflow" v={overview.apps?.workflow ? "✓" : "—"} />
              <Row k="Outline" v={overview.apps?.outboundOutline ? "✓" : "—"} />
              <Row k="Completion" v={overview.apps?.completion ? "✓" : "—"} />
              <Row k="Tools org" v={String(overview.tools?.defaultOrgId ?? "—")} />
              <Row
                k="Chat rate limit"
                v={`${overview.rateLimit?.chatPerUser ?? "—"} / window`}
              />
              <Row
                k="Tools rate limit"
                v={`${overview.ops?.toolsRateLimit ?? "—"} / ${Math.round((overview.ops?.toolsRateWindowMs ?? 60000) / 1000)}s`}
              />
              <Row
                k="IP allowlist"
                v={overview.ops?.toolsIpAllowlistConfigured ? "configured" : "open"}
              />
              <Row
                k="Answer cache"
                v={
                  overview.cache?.answerCacheEnabled
                    ? `${overview.cache.answerCacheSize ?? 0} entries`
                    : "off"
                }
              />
            </dl>
            {!overview.enabled && (
              <p className="mt-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                ตั้ง ENABLE_DIFY=true และ keys ตาม docs/dify/PHASE6-SETUP.md
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-outline-variant/25 bg-surface-lowest p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-bold text-on-surface">
                <Activity size={16} /> Audit log
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="rounded-lg border border-outline-variant/40 bg-surface-bright px-2 py-1 text-xs"
                >
                  <option value="">ทุก kind</option>
                  <option value="tool">tool</option>
                  <option value="chat">chat</option>
                  <option value="workflow">workflow</option>
                  <option value="outbound_outline">outbound_outline</option>
                  <option value="admin">admin</option>
                </select>
                <button
                  type="button"
                  onClick={() => void clearAudit()}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2 py-1 text-xs font-semibold text-rose-700"
                >
                  <Trash2 size={12} /> ล้าง
                </button>
              </div>
            </div>

            {events.length === 0 ? (
              <p className="text-sm text-on-surface-variant">ยังไม่มี event (เรียก tools/chat ก่อน)</p>
            ) : (
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface-lowest text-on-surface-variant">
                    <tr>
                      <th className="py-1.5 pr-2">Time</th>
                      <th className="py-1.5 pr-2">Kind</th>
                      <th className="py-1.5 pr-2">Action</th>
                      <th className="py-1.5 pr-2">OK</th>
                      <th className="py-1.5 pr-2">ms</th>
                      <th className="py-1.5">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id} className="border-t border-outline-variant/15">
                        <td className="py-1.5 pr-2 whitespace-nowrap text-on-surface-variant">
                          {new Date(e.at).toLocaleString("th-TH")}
                        </td>
                        <td className="py-1.5 pr-2 font-mono">{e.kind}</td>
                        <td className="py-1.5 pr-2 font-mono">{e.action}</td>
                        <td className="py-1.5 pr-2">
                          {e.ok ? (
                            <CheckCircle2 size={14} className="text-emerald-600" />
                          ) : (
                            <AlertCircle size={14} className="text-rose-600" />
                          )}
                        </td>
                        <td className="py-1.5 pr-2">{e.latencyMs ?? "—"}</td>
                        <td className="py-1.5 max-w-[14rem] truncate" title={e.detail}>
                          {e.detail ?? "—"}
                          {e.organizationId != null ? ` · org=${e.organizationId}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/25 bg-surface-lowest p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm font-bold ${
          ok ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-200"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-outline-variant/10 py-1">
      <dt className="text-on-surface-variant">{k}</dt>
      <dd className="font-mono text-xs font-semibold text-on-surface">{v}</dd>
    </div>
  );
}
