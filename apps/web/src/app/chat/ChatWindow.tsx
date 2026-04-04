"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  BookOpen,
  TrendingUp,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

// ─── types ────────────────────────────────────────────────────────────────────

type SourceType = "policy" | "horizon";

interface Source {
  type: SourceType;
  title: string;
  summary: string;
  score: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

// ─── constants ────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "หนังสือราชการมีกี่ประเภท อะไรบ้าง?",
  "วิธีการรับหนังสือราชการที่ถูกต้องมีขั้นตอนอะไรบ้าง?",
  "หนังสือภายนอกและหนังสือภายในต่างกันอย่างไร?",
  "การเก็บรักษาหนังสือราชการมีกฎเกณฑ์อย่างไร?",
  "วิธีการร่างหนังสือราชการที่ถูกต้องทำอย่างไร?",
  "ทะเบียนหนังสือรับ-ส่งต้องบันทึกอะไรบ้าง?",
];

// ─── sub-components ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2">
        <div className="shrink-0 w-8 h-8 rounded-2xl bg-secondary flex items-center justify-center shadow-lg shadow-secondary/20">
          <Bot size={15} className="text-on-secondary" />
        </div>
        <div className="bg-surface-lowest border border-outline-variant/10 rounded-2xl rounded-tl-sm px-4 py-3.5">
          <div className="flex gap-1.5 items-center h-4">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-secondary-fixed-dim animate-bounce"
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceCard({ source }: { source: Source }) {
  const isPolicy = source.type === "policy";
  return (
    <div className="text-xs bg-surface-low border border-outline-variant/10 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        {isPolicy ? (
          <BookOpen size={11} className="text-secondary shrink-0" />
        ) : (
          <TrendingUp size={11} className="text-tertiary shrink-0" />
        )}
        <span
          className={`font-bold text-xs ${isPolicy ? "text-secondary" : "text-tertiary"}`}
        >
          {isPolicy ? "ระเบียบ/นโยบาย" : "แนวโน้ม"}
        </span>
        <span className="ml-auto text-outline font-mono">
          {Math.round(source.score * 100)}%
        </span>
      </div>
      <p className="font-medium text-on-surface">{source.title}</p>
      {source.summary && (
        <p className="text-on-surface-variant mt-0.5 leading-relaxed line-clamp-2">
          {source.summary}
        </p>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const [showSources, setShowSources] = useState(false);
  const isUser = message.role === "user";
  const hasSources = (message.sources?.length ?? 0) > 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] ${isUser ? "" : "w-full"}`}>
        <div className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
          {/* Avatar */}
          <div
            className={`shrink-0 w-8 h-8 rounded-2xl flex items-center justify-center ${
              isUser ? "bg-primary shadow-md shadow-primary/20" : "bg-secondary shadow-lg shadow-secondary/20"
            }`}
          >
            {isUser ? (
              <User size={15} className="text-on-primary" />
            ) : (
              <Bot size={15} className="text-on-secondary" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Bubble */}
            <div
              className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                isUser
                  ? "bg-primary text-on-primary rounded-tr-sm shadow-md"
                  : "bg-surface-lowest border border-outline-variant/10 text-on-surface rounded-tl-sm shadow-sm"
              }`}
            >
              {message.content}
            </div>

            {/* Sources toggle */}
            {hasSources && (
              <button
                onClick={() => setShowSources((v) => !v)}
                className="mt-2 flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors pl-1 font-bold"
              >
                <BookOpen size={11} />
                {showSources ? "ซ่อน" : "ดู"}แหล่งอ้างอิง (
                {message.sources!.length})
                {showSources ? (
                  <ChevronUp size={11} />
                ) : (
                  <ChevronDown size={11} />
                )}
              </button>
            )}

            {/* Sources list */}
            {hasSources && showSources && (
              <div className="mt-2 space-y-1.5">
                {message.sources!.map((s, i) => (
                  <SourceCard key={i} source={s} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onSuggest }: { onSuggest: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="bg-secondary p-5 rounded-3xl mb-5 shadow-lg shadow-secondary/20">
        <Bot size={36} className="text-on-secondary" />
      </div>
      <h2 className="text-lg font-bold text-on-surface mb-1">
        สวัสดีครับ! ผมคือ AI สารบรรณ
      </h2>
      <p className="text-sm text-on-surface-variant mb-8 max-w-sm leading-relaxed">
        สามารถถามเรื่องระเบียบงานสารบรรณ หนังสือราชการ
        และการจัดการเอกสาร&nbsp;— ตอบโดยใช้ข้อมูลจากฐานความรู้ RAG
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            className="text-left text-sm px-4 py-3 bg-surface-lowest border border-outline-variant/20 rounded-2xl hover:border-primary/30 hover:bg-primary-fixed/30 text-on-surface-variant transition-colors leading-snug"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(query: string) {
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const data = await apiFetch<{ answer: string; sources: Source[] }>(
        "/chat/message",
        { method: "POST", body: JSON.stringify({ query: trimmed }) },
      );

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.answer ?? "ขออภัย ไม่สามารถตอบได้",
          sources: data.sources ?? [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `เกิดข้อผิดพลาดในการเชื่อมต่อ API (${err instanceof Error ? err.message : "unknown"}) กรุณาตรวจสอบว่า API กำลังทำงานอยู่`,
        },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* ── Header ── */}
      <div className="bg-surface-lowest border border-outline-variant/10 rounded-2xl px-5 py-4 flex items-center gap-3 mb-4 shrink-0 shadow-sm">
        <div className="bg-secondary p-2.5 rounded-xl shadow-md shadow-secondary/20">
          <Bot size={20} className="text-on-secondary" />
        </div>
        <div>
          <h1 className="font-bold text-primary">AI สารบรรณ</h1>
          <p className="text-xs text-on-surface-variant">
            ผู้ช่วยตอบคำถามงานสารบรรณและระเบียบราชการ
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full font-bold uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
          RAG พร้อมใช้
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-xs text-outline hover:text-primary px-3 py-1.5 rounded-xl hover:bg-surface-low transition-colors font-medium"
          >
            ล้างแชท
          </button>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState onSuggest={send} />
        ) : (
          <div className="space-y-5 pb-2">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="mt-4 shrink-0 bg-surface-lowest border border-outline-variant/20 rounded-2xl p-3 flex items-end gap-3 shadow-lg shadow-primary/5">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="พิมพ์คำถามเกี่ยวกับงานสารบรรณ… (Enter ส่ง / Shift+Enter ขึ้นบรรทัดใหม่)"
          rows={2}
          disabled={loading}
          className="flex-1 resize-none text-sm outline-none text-on-surface placeholder-outline/50 max-h-36 overflow-y-auto disabled:opacity-50 bg-transparent"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="bg-primary hover:brightness-110 active:scale-95 disabled:bg-surface-high disabled:text-outline text-on-primary p-2.5 rounded-xl transition-all shrink-0 shadow-md shadow-primary/20"
          aria-label="ส่งข้อความ"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>
    </div>
  );
}
