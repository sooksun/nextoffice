"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { Loader2, MessageSquareText, Send, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  caseId: number;
  caseTitle: string;
}

interface DifyStatus {
  enabled: boolean;
  configured: boolean;
  apps?: { chat?: boolean };
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  meta?: string;
}

const PRESETS = [
  "สรุปว่าหนังสือฉบับนี้ต้องการให้โรงเรียนทำอะไร?",
  "หนังสือนี้ต้องตอบกลับหรือไม่?",
  "ความเร่งด่วนและกำหนดเวลาคืออะไร?",
  "มีระเบียบหรือนโยบายอะไรที่เกี่ยวข้อง?",
];

/**
 * Phase 3: compact Dify Q&A card on case detail — always scopes to this caseId.
 */
export default function CaseDifyAsk({ caseId, caseTitle }: Props) {
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<DifyStatus>("/dify/status")
      .then((s) => {
        if (!cancelled) {
          setReady(!!(s.enabled && (s.apps?.chat ?? s.configured)));
          setStatusChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReady(false);
          setStatusChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const send = useCallback(
    async (text: string) => {
      const query = text.trim();
      if (!query || loading || !ready) return;
      setTurns((prev) => [...prev, { role: "user", content: query }]);
      setInput("");
      setLoading(true);
      try {
        const res = await apiFetch<{
          answer: string;
          conversationId: string | null;
          cached?: boolean;
          latencyMs?: number;
        }>("/dify/chat", {
          method: "POST",
          body: JSON.stringify({
            query,
            caseId,
            conversationId: conversationId || undefined,
          }),
        });
        if (res.conversationId) setConversationId(res.conversationId);
        const bits: string[] = [];
        if (res.cached) bits.push("cache");
        if (res.latencyMs != null) bits.push(`${res.latencyMs}ms`);
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.answer,
            meta: bits.length ? bits.join(" · ") : undefined,
          },
        ]);
      } catch (e: unknown) {
        toastError(getErrorMessage(e, "ถาม Dify ไม่สำเร็จ"));
        setTurns((prev) => [
          ...prev,
          { role: "assistant", content: getErrorMessage(e, "เชื่อมต่อ Dify ไม่ได้") },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [caseId, conversationId, loading, ready],
  );

  if (statusChecked && !ready) {
    return null; // hide card when Dify is off — no noise
  }

  return (
    <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-violet-500/10 transition-colors"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white">
          <Sparkles size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-violet-900 dark:text-violet-100">
            ถาม AI เกี่ยวกับหนังสือฉบับนี้
          </p>
          <p className="truncate text-[11px] text-violet-800/70 dark:text-violet-200/70">
            Dify · เคส #{caseId} · {caseTitle}
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-violet-600" /> : <ChevronDown size={16} className="text-violet-600" />}
      </button>

      {open && (
        <div className="border-t border-violet-500/15 px-4 pb-4 pt-3">
          {!statusChecked ? (
            <p className="flex items-center gap-2 text-xs text-on-surface-variant">
              <Loader2 size={12} className="animate-spin" /> กำลังตรวจ Dify…
            </p>
          ) : (
            <>
              {turns.length === 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={loading}
                      onClick={() => void send(p)}
                      className="rounded-full border border-violet-500/30 bg-white/60 px-2.5 py-1 text-left text-[11px] text-violet-900 hover:bg-violet-500/10 disabled:opacity-50 dark:bg-surface-lowest dark:text-violet-100"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              {turns.length > 0 && (
                <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
                  {turns.map((t, i) => (
                    <div
                      key={i}
                      className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                        t.role === "user"
                          ? "ml-6 bg-violet-600 text-white"
                          : "mr-4 border border-violet-500/20 bg-white/80 text-on-surface dark:bg-surface-lowest"
                      }`}
                    >
                      {t.role === "assistant" && (
                        <span className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase text-violet-600">
                          <MessageSquareText size={9} /> Dify
                          {t.meta ? ` · ${t.meta}` : ""}
                        </span>
                      )}
                      <div className="whitespace-pre-wrap">{t.content}</div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                      <Loader2 size={12} className="animate-spin" /> กำลังคิด…
                    </div>
                  )}
                </div>
              )}

              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  placeholder="ถามเกี่ยวกับหนังสือฉบับนี้…"
                  className="min-w-0 flex-1 rounded-xl border border-violet-500/30 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none dark:bg-surface-lowest"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </form>
              {turns.length > 0 && (
                <button
                  type="button"
                  className="mt-2 text-[10px] text-violet-700/80 hover:underline"
                  onClick={() => {
                    setTurns([]);
                    setConversationId(null);
                  }}
                >
                  ล้างบทสนทนา
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
