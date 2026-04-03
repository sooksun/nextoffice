"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  BookOpen,
  TrendingUp,
  Loader2,
  X,
  MessageSquareText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

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
  "หนังสือราชการมีกี่ประเภท?",
  "วิธีการรับหนังสือราชการ?",
  "หนังสือภายนอกกับภายในต่างกันอย่างไร?",
  "การเก็บรักษาหนังสือราชการ?",
];

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// ─── sub-components ───────────────────────────────────────────────────────────

function PanelSourceCard({ source }: { source: Source }) {
  const isPolicy = source.type === "policy";
  return (
    <div className="text-[11px] bg-surface-low border border-outline-variant/10 rounded-xl px-2.5 py-2">
      <div className="flex items-center gap-1.5 mb-0.5">
        {isPolicy ? (
          <BookOpen size={10} className="text-secondary shrink-0" />
        ) : (
          <TrendingUp size={10} className="text-tertiary shrink-0" />
        )}
        <span className={`font-bold ${isPolicy ? "text-secondary" : "text-tertiary"}`}>
          {isPolicy ? "ระเบียบ" : "แนวโน้ม"}
        </span>
        <span className="ml-auto text-outline font-mono text-[10px]">
          {Math.round(source.score * 100)}%
        </span>
      </div>
      <p className="font-medium text-on-surface leading-snug line-clamp-2">{source.title}</p>
    </div>
  );
}

function PanelMessage({ message }: { message: Message }) {
  const [showSources, setShowSources] = useState(false);
  const isUser = message.role === "user";
  const hasSources = (message.sources?.length ?? 0) > 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[90%] ${isUser ? "" : "w-full"}`}>
        <div className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
          <div
            className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${
              isUser ? "bg-primary" : "bg-secondary"
            }`}
          >
            {isUser ? (
              <User size={12} className="text-on-primary" />
            ) : (
              <Bot size={12} className="text-on-secondary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div
              className={`px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words ${
                isUser
                  ? "bg-primary text-on-primary rounded-tr-sm"
                  : "bg-surface-low border border-outline-variant/10 text-on-surface rounded-tl-sm"
              }`}
            >
              {message.content}
            </div>
            {hasSources && (
              <button
                onClick={() => setShowSources((v) => !v)}
                className="mt-1 flex items-center gap-1 text-[10px] text-secondary hover:text-primary transition-colors font-bold"
              >
                <BookOpen size={9} />
                {showSources ? "ซ่อน" : "ดู"}อ้างอิง ({message.sources!.length})
                {showSources ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
              </button>
            )}
            {hasSources && showSources && (
              <div className="mt-1 space-y-1">
                {message.sources!.map((s, i) => (
                  <PanelSourceCard key={i} source={s} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const res = await fetch(`${API_BASE}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
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
          content: `เกิดข้อผิดพลาด (${err instanceof Error ? err.message : "unknown"})`,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {/* Toggle Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-50 bg-secondary text-on-secondary p-3 rounded-2xl shadow-lg shadow-secondary/30 hover:brightness-110 active:scale-95 transition-all"
          aria-label="เปิดแชท AI"
        >
          <MessageSquareText size={22} />
        </button>
      )}

      {/* Panel */}
      <aside
        className={`shrink-0 border-l border-outline-variant/10 bg-surface-lowest flex flex-col transition-all duration-300 ${
          open ? "w-80" : "w-0 overflow-hidden"
        }`}
      >
        {/* Panel Header */}
        <div className="shrink-0 px-4 py-3 border-b border-outline-variant/10 flex items-center gap-2">
          <div className="bg-secondary p-1.5 rounded-lg shadow-sm shadow-secondary/20">
            <Bot size={14} className="text-on-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-black text-primary uppercase tracking-wider">AI สารบรรณ</h3>
            <p className="text-[10px] text-on-surface-variant truncate">ถามเรื่องระเบียบงานสารบรรณ</p>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-[10px] text-emerald-600 font-bold">RAG</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 text-outline hover:text-primary hover:bg-surface-high rounded-lg transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-2">
              <div className="bg-secondary/10 p-3 rounded-2xl mb-3">
                <Bot size={24} className="text-secondary" />
              </div>
              <p className="text-xs text-on-surface-variant mb-4">ถามคำถามเกี่ยวกับงานสารบรรณ ระเบียบราชการ</p>
              <div className="space-y-1.5 w-full">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left text-[11px] px-3 py-2 bg-surface-low border border-outline-variant/10 rounded-xl hover:border-primary/30 hover:bg-primary-fixed/30 text-on-surface-variant transition-colors leading-snug"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <PanelMessage key={msg.id} message={msg} />
              ))}
              {loading && (
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Bot size={12} className="text-on-secondary" />
                  </div>
                  <div className="bg-surface-low border border-outline-variant/10 rounded-xl rounded-tl-sm px-3 py-2">
                    <div className="flex gap-1 items-center h-3">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-secondary-fixed-dim animate-bounce"
                          style={{ animationDelay: `${i * 160}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 px-3 py-3 border-t border-outline-variant/10">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-[10px] text-outline hover:text-primary mb-2 font-medium"
            >
              ล้างแชท
            </button>
          )}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="พิมพ์คำถามของคุณ..."
              disabled={loading}
              className="w-full text-xs bg-surface-low border border-outline-variant/20 rounded-xl py-2.5 pl-3 pr-10 focus:ring-2 focus:ring-primary/20 focus:border-primary/30 outline-none disabled:opacity-50 transition-all"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-secondary disabled:text-outline transition-colors"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
