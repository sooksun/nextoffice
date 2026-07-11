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
} from "lucide-react";

type ChatRole = "user" | "assistant";

interface Turn {
  id: string;
  role: ChatRole;
  content: string;
}

interface DifyStatus {
  enabled: boolean;
  configured: boolean;
  apiBase: string | null;
  app: string;
}

interface DifyChatResponse {
  answer: string;
  conversationId: string | null;
  messageId: string | null;
  provider: string;
}

const SUGGESTIONS = [
  "หนังสือราชการมีกี่ประเภท ตามระเบียบสารบรรณ?",
  "ขั้นตอนการลงรับหนังสือเข้าจากภายนอก?",
  "หนังสือด่วนที่สุด ต้องปฏิบัติอย่างไร?",
  "การเก็บรักษาและทำลายหนังสือราชการมีหลักเกณฑ์อย่างไร?",
  "หนังสือภายในกับหนังสือภายนอกต่างกันอย่างไร?",
];

export default function DifyPolicyChatPage() {
  const [status, setStatus] = useState<DifyStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [letterContext, setLetterContext] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await apiFetch<DifyStatus>("/dify/status");
      setStatus(s);
    } catch {
      setStatus({ enabled: false, configured: false, apiBase: null, app: "policy-letter-chat" });
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

    const userTurn: Turn = {
      id: `u-${Date.now()}`,
      role: "user",
      content: query,
    };
    setTurns((prev) => [...prev, userTurn]);
    setInput("");
    setSending(true);

    try {
      const res = await apiFetch<DifyChatResponse>("/dify/chat", {
        method: "POST",
        body: JSON.stringify({
          query,
          conversationId: conversationId || undefined,
          letterContext: letterContext.trim() || undefined,
        }),
      });
      if (res.conversationId) setConversationId(res.conversationId);
      setTurns((prev) => [
        ...prev,
        {
          id: res.messageId || `a-${Date.now()}`,
          role: "assistant",
          content: res.answer,
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

  const ready = status?.enabled && status?.configured;
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
            Phase 1 · Dify Chat — ถามระเบียบสารบรรณ นโยบายการศึกษา และหนังสือราชการ
            (ไม่แทนที่ระบบลงรับ/อนุมัติ)
          </p>
        </div>
        <span
          className={`mt-1 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            ready
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
          }`}
        >
          {statusLoading ? "กำลังตรวจ…" : ready ? "Dify พร้อม" : "ยังไม่พร้อม"}
        </span>
      </div>

      {disabledReason && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-100">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{disabledReason}</p>
            <p className="mt-0.5 text-xs opacity-90">
              ดูคู่มือ: <code className="font-mono">docs/dify/PHASE1-SETUP.md</code>
            </p>
          </div>
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowContext((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1 text-xs font-medium text-on-surface-variant hover:border-primary/40 hover:text-primary"
        >
          <FileText size={12} />
          {showContext ? "ซ่อนบริบทหนังสือ" : "แนบบริบทหนังสือ (ถ้ามี)"}
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
        <textarea
          value={letterContext}
          onChange={(e) => setLetterContext(e.target.value)}
          rows={3}
          placeholder="วางสรุป/ข้อความหนังสือที่ต้องการถาม (ไม่บังคับ)…"
          className="mb-3 w-full resize-y rounded-xl border border-outline-variant/40 bg-surface-bright px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
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
                คำตอบมาจาก Dify Chat app — ใช้เป็นแนวทาง ต้องตรวจสอบกับระเบียบฉบับจริงก่อนปฏิบัติ
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!ready || sending}
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
                    : "bg-surface-bright text-on-surface border border-outline-variant/20"
                }`}
              >
                {t.role === "assistant" && (
                  <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                    <Sparkles size={10} /> Dify
                  </span>
                )}
                {t.content}
              </div>
            </div>
          ))}

          {sending && (
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
            disabled={!ready || sending}
            placeholder={
              ready
                ? "พิมพ์คำถาม เช่น ขั้นตอนลงรับหนังสือด่วน…"
                : "ตั้งค่า Dify ก่อนใช้งาน"
            }
            className="min-w-0 flex-1 rounded-xl border border-outline-variant/40 bg-surface-bright px-3 py-2.5 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!ready || sending || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-transform active:scale-95 disabled:opacity-40"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            ส่ง
          </button>
        </form>
      </div>
    </div>
  );
}
