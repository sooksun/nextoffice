"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import {
  BookOpen,
  FileText,
  Loader2,
  MessageSquareText,
  Send,
  Sparkles,
  AlertCircle,
  Workflow,
} from "lucide-react";

type ChatRole = "user" | "assistant";

interface Turn {
  id: string;
  role: ChatRole;
  content: string;
  meta?: string;
}

interface DifyStatus {
  enabled: boolean;
  configured: boolean;
  apiBase: string | null;
  apps?: { chat: boolean; workflow: boolean; completion: boolean; outboundOutline?: boolean };
  cache?: { answerCacheEnabled: boolean; answerCacheSize: number };
  phase?: number;
  cached?: boolean;
}

interface DifyChatResponse {
  answer: string;
  conversationId: string | null;
  messageId: string | null;
  provider: string;
  cached?: boolean;
  latencyMs?: number;
  caseId?: number | null;
  hasLetterContext?: boolean;
}

interface DifyWorkflowResponse {
  text: string;
  status: string | null;
  outputs: Record<string, unknown>;
  latencyMs?: number;
  workflowRunId?: string | null;
}

const SUGGESTIONS = [
  "หนังสือราชการมีกี่ประเภท ตามระเบียบสารบรรณ?",
  "ขั้นตอนการลงรับหนังสือเข้าจากภายนอก?",
  "หนังสือด่วนที่สุด ต้องปฏิบัติอย่างไร?",
  "การเก็บรักษาและทำลายหนังสือราชการมีหลักเกณฑ์อย่างไร?",
  "หนังสือภายในกับหนังสือภายนอกต่างกันอย่างไร?",
];

type Tab = "chat" | "workflow";

export default function DifyPolicyChatPage() {
  const [status, setStatus] = useState<DifyStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("chat");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [letterContext, setLetterContext] = useState("");
  const [caseId, setCaseId] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [workflowQuery, setWorkflowQuery] = useState("");
  const [workflowResult, setWorkflowResult] = useState<DifyWorkflowResponse | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await apiFetch<DifyStatus>("/dify/status");
      setStatus(s);
    } catch {
      setStatus({ enabled: false, configured: false, apiBase: null });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, sending]);

  const send = async (text: string) => {
    const query = text.trim();
    if (!query || sending) return;

    const caseNum = caseId.trim() ? Number(caseId.trim()) : undefined;
    setTurns((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        role: "user",
        content: query,
        meta: caseNum ? `เคส #${caseNum}` : undefined,
      },
    ]);
    setInput("");
    setSending(true);

    try {
      const res = await apiFetch<DifyChatResponse>("/dify/chat", {
        method: "POST",
        body: JSON.stringify({
          query,
          conversationId: conversationId || undefined,
          letterContext: letterContext.trim() || undefined,
          caseId: caseNum && Number.isFinite(caseNum) ? caseNum : undefined,
        }),
      });
      if (res.conversationId) setConversationId(res.conversationId);
      const bits: string[] = [];
      if (res.cached) bits.push("cache");
      if (res.latencyMs != null) bits.push(`${res.latencyMs}ms`);
      if (res.hasLetterContext) bits.push("มีบริบทหนังสือ");
      setTurns((prev) => [
        ...prev,
        {
          id: res.messageId || `a-${Date.now()}`,
          role: "assistant",
          content: res.answer,
          meta: bits.length ? bits.join(" · ") : undefined,
        },
      ]);
    } catch (e: unknown) {
      toastError(getErrorMessage(e, "ถาม Dify ไม่สำเร็จ"));
      setTurns((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `ขออภัย: ${getErrorMessage(e, "เชื่อมต่อ Dify ไม่ได้")}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const runWorkflow = async () => {
    const q = workflowQuery.trim();
    if (!q || sending) return;
    setSending(true);
    setWorkflowResult(null);
    try {
      const res = await apiFetch<DifyWorkflowResponse>("/dify/workflows/run", {
        method: "POST",
        body: JSON.stringify({ inputs: { query: q } }),
      });
      setWorkflowResult(res);
    } catch (e: unknown) {
      toastError(getErrorMessage(e, "รัน Workflow ไม่สำเร็จ"));
    } finally {
      setSending(false);
    }
  };

  const chatReady = status?.enabled && (status.apps?.chat ?? status.configured);
  const workflowReady = status?.enabled && status.apps?.workflow;
  const disabledReason = statusLoading
    ? null
    : !status?.enabled
      ? "ยังไม่เปิด ENABLE_DIFY=true บน API"
      : !status?.configured
        ? "ยังไม่ได้ตั้ง DIFY_API_BASE / DIFY_API_KEY_CHAT"
        : null;

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-3xl flex-col">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15">
          <BookOpen className="text-violet-600" size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black tracking-tight text-primary">
            ถาม AI เรื่องหนังสือ / นโยบาย
          </h1>
          <p className="text-xs text-on-surface-variant">
            Phase {status?.phase ?? 2} · Dify Chat
            {status?.apps?.workflow ? " + Workflow" : ""} — ไม่แทนที่ระบบลงรับ/อนุมัติ
          </p>
        </div>
        <span
          className={`mt-1 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            chatReady
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
          }`}
        >
          {statusLoading ? "กำลังตรวจ…" : chatReady ? "Dify พร้อม" : "ยังไม่พร้อม"}
        </span>
      </div>

      {disabledReason && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-100">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{disabledReason}</p>
            <p className="mt-0.5 text-xs opacity-90">
              ดูคู่มือ: <code className="font-mono">docs/dify/PHASE2-SETUP.md</code>
            </p>
          </div>
        </div>
      )}

      {status?.apps && (
        <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
          <AppBadge label="Chat" on={!!status.apps.chat} />
          <AppBadge label="Workflow" on={!!status.apps.workflow} />
          <AppBadge label="Outline" on={!!status.apps.outboundOutline} />
          <AppBadge label="Completion" on={!!status.apps.completion} />
          {status.cache?.answerCacheEnabled && (
            <span className="rounded-full bg-surface-bright px-2 py-0.5 text-on-surface-variant">
              cache {status.cache.answerCacheSize}
            </span>
          )}
        </div>
      )}

      <div className="mb-3 flex gap-2">
        <TabButton active={tab === "chat"} onClick={() => setTab("chat")} icon={MessageSquareText}>
          แชท
        </TabButton>
        <TabButton
          active={tab === "workflow"}
          onClick={() => setTab("workflow")}
          icon={Workflow}
          disabled={!workflowReady}
        >
          Workflow
        </TabButton>
      </div>

      {tab === "chat" && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowContext((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1 text-xs font-medium text-on-surface-variant hover:border-primary/40 hover:text-primary"
            >
              <FileText size={12} />
              {showContext ? "ซ่อนบริบท" : "บริบทหนังสือ / เคส"}
            </button>
            {conversationId && (
              <button
                type="button"
                onClick={() => {
                  setConversationId(null);
                  setTurns([]);
                }}
                className="rounded-lg border border-outline-variant/40 px-2.5 py-1 text-xs font-medium text-on-surface-variant hover:text-primary"
              >
                เริ่มบทสนทนาใหม่
              </button>
            )}
          </div>

          {showContext && (
            <div className="mb-3 space-y-2 rounded-xl border border-outline-variant/30 bg-surface-bright/50 p-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                  เลขเคส (InboundCase id) — โหลดสรุปจากระบบอัตโนมัติ
                </label>
                <input
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="เช่น 42"
                  className="w-full rounded-lg border border-outline-variant/40 bg-surface-lowest px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                  ข้อความหนังสือเพิ่มเติม (ไม่บังคับ)
                </label>
                <textarea
                  value={letterContext}
                  onChange={(e) => setLetterContext(e.target.value)}
                  rows={3}
                  placeholder="วางสรุป/ข้อความหนังสือ…"
                  className="w-full resize-y rounded-lg border border-outline-variant/40 bg-surface-lowest px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-lowest shadow-sm">
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {turns.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <MessageSquareText className="mb-3 text-violet-500/70" size={36} />
                  <p className="mb-1 text-sm font-semibold text-on-surface">
                    ถามเกี่ยวกับหนังสือราชการหรือนโยบาย
                  </p>
                  <p className="mb-4 max-w-sm text-xs text-on-surface-variant">
                    ใส่เลขเคสเพื่อให้ AI อ่านสรุปจาก NextOffice ก่อนตอบ (Phase 2)
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={!chatReady || sending}
                        onClick={() => send(s)}
                        className="rounded-full border border-violet-500/25 bg-violet-500/5 px-3 py-1.5 text-left text-xs text-violet-800 hover:bg-violet-500/10 disabled:opacity-40 dark:text-violet-200"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {turns.map((t) => (
                <div
                  key={t.id}
                  className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      t.role === "user"
                        ? "bg-primary text-on-primary"
                        : "border border-outline-variant/20 bg-surface-bright text-on-surface"
                    }`}
                  >
                    {t.role === "assistant" && (
                      <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                        <Sparkles size={10} /> Dify
                        {t.meta ? ` · ${t.meta}` : ""}
                      </span>
                    )}
                    {t.role === "user" && t.meta && (
                      <span className="mb-1 block text-[10px] opacity-80">{t.meta}</span>
                    )}
                    {t.content}
                  </div>
                </div>
              ))}

              {sending && tab === "chat" && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-outline-variant/20 bg-surface-bright px-3.5 py-2.5 text-sm text-on-surface-variant">
                    <Loader2 size={14} className="animate-spin" />
                    กำลังถาม Dify…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form
              className="flex gap-2 border-t border-outline-variant/20 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={!chatReady || sending}
                placeholder={
                  chatReady
                    ? "พิมพ์คำถาม เช่น ขั้นตอนลงรับหนังสือด่วน…"
                    : "ตั้งค่า Dify ก่อนใช้งาน"
                }
                className="min-w-0 flex-1 rounded-xl border border-outline-variant/40 bg-surface-bright px-3 py-2.5 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!chatReady || sending || !input.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-transform active:scale-95 disabled:opacity-40"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                ส่ง
              </button>
            </form>
          </div>
        </>
      )}

      {tab === "workflow" && (
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-outline-variant/25 bg-surface-lowest p-4 shadow-sm">
          {!workflowReady ? (
            <p className="text-sm text-on-surface-variant">
              ตั้ง <code className="font-mono text-xs">DIFY_API_KEY_WORKFLOW</code> แล้วสร้าง Workflow
              app ใน Dify — ดู <code className="font-mono text-xs">docs/dify/PHASE2-SETUP.md</code>
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-on-surface-variant">
                รัน Workflow แบบ blocking — inputs ส่งเป็น <code className="font-mono">query</code>{" "}
                (ปรับชื่อตัวแปรให้ตรง Start node ของคุณ)
              </p>
              <textarea
                value={workflowQuery}
                onChange={(e) => setWorkflowQuery(e.target.value)}
                rows={4}
                placeholder="เช่น สรุปขั้นตอนลงรับหนังสือด่วนที่สุด…"
                className="mb-3 w-full rounded-xl border border-outline-variant/40 bg-surface-bright px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                disabled={sending || !workflowQuery.trim()}
                onClick={() => void runWorkflow()}
                className="mb-4 inline-flex w-fit items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Workflow size={16} />}
                รัน Workflow
              </button>
              {workflowResult && (
                <div className="flex-1 overflow-y-auto rounded-xl border border-outline-variant/20 bg-surface-bright p-3 text-sm">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-violet-600">
                    status={workflowResult.status ?? "—"}
                    {workflowResult.latencyMs != null ? ` · ${workflowResult.latencyMs}ms` : ""}
                  </div>
                  <pre className="whitespace-pre-wrap font-sans leading-relaxed">
                    {workflowResult.text || JSON.stringify(workflowResult.outputs, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AppBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-semibold ${
        on
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-surface-bright text-on-surface-variant"
      }`}
    >
      {label} {on ? "✓" : "—"}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
        active
          ? "border-violet-500 bg-violet-500/10 text-violet-800 dark:text-violet-200"
          : "border-outline-variant/40 text-on-surface-variant hover:border-primary/30"
      }`}
    >
      <Icon size={14} />
      {children}
    </button>
  );
}
