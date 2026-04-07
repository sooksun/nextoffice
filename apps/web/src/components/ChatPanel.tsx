"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
  MapPin,
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

interface PageContext {
  route: string;
  entityId?: number;
  searchQuery?: string;
  filters?: Record<string, string>;
}

// ─── page-aware suggestions ──────────────────────────────────────────────────

const DEFAULT_SUGGESTIONS = [
  "หนังสือราชการมีกี่ประเภท?",
  "วิธีการรับหนังสือราชการ?",
  "หนังสือภายนอกกับภายในต่างกันอย่างไร?",
  "การเก็บรักษาหนังสือราชการ?",
];

const PAGE_SUGGESTIONS: Record<string, string[]> = {
  "/saraban/inbound": [
    "สรุปหนังสือเข้าล่าสุดให้หน่อย",
    "มีหนังสือด่วนที่สุดกี่ฉบับ?",
    "รายการที่ยังไม่ได้ลงรับมีอะไรบ้าง?",
    "ขั้นตอนการลงทะเบียนรับหนังสือ?",
  ],
  "/saraban/outbound": [
    "สรุปหนังสือส่งออกล่าสุด",
    "ขั้นตอนการส่งหนังสือราชการ?",
    "วิธีการออกเลขที่หนังสือส่ง?",
    "หนังสือส่งออกมีกี่ประเภท?",
  ],
  "/inbox": [
    "สรุปเอกสารเข้าล่าสุด",
    "มีเอกสารด่วนอะไรบ้าง?",
    "เอกสารที่รอมอบหมายมีกี่รายการ?",
    "วิธีการรับหนังสือราชการ?",
  ],
  "/cases": [
    "สรุปสถานะเคสทั้งหมด",
    "มีเคสค้างที่ยังไม่เสร็จกี่เรื่อง?",
    "เคสด่วนที่สุดมีเรื่องอะไรบ้าง?",
    "ขั้นตอนการจัดการเคส?",
  ],
  "/documents": [
    "มีเอกสารทั้งหมดกี่ฉบับ?",
    "ค้นหาเอกสารเกี่ยวกับงบประมาณ",
    "เอกสารล่าสุดที่เข้ามา?",
    "วิธีการจัดเก็บเอกสาร?",
  ],
  "/intakes": [
    "มีเอกสารที่รอประมวลผลกี่รายการ?",
    "สถานะ OCR ปัจจุบันเป็นอย่างไร?",
    "เอกสารที่ AI วิเคราะห์เสร็จแล้วมีอะไรบ้าง?",
    "ขั้นตอนการประมวลผลเอกสาร?",
  ],
  "/outbound": [
    "สรุปหนังสือส่งออกทั้งหมด",
    "วิธีสร้างหนังสือส่งออกใหม่?",
    "หนังสือที่รออนุมัติมีกี่ฉบับ?",
    "แบบฟอร์มหนังสือราชการมีกี่ประเภท?",
  ],
  "/horizon": [
    "มีวาระนโยบายอะไรที่สำคัญ?",
    "สัญญาณการเปลี่ยนแปลงล่าสุด?",
    "แนวโน้มนโยบายการศึกษาปัจจุบัน?",
    "Horizon Intelligence คืออะไร?",
  ],
  "/attendance": [
    "สถานะลงเวลาวันนี้?",
    "วิธีลงทะเบียนใบหน้า?",
    "ลงเวลาได้ภายในกี่เมตรจากโรงเรียน?",
    "ลงเวลาสายกี่โมง?",
  ],
  "/leave": [
    "ลาป่วยได้กี่วัน?",
    "สิทธิ์การลาของข้าราชการครูมีอะไรบ้าง?",
    "วิธีการส่งใบลา?",
    "สถานะใบลาของฉัน?",
  ],
  "/leave/travel": [
    "วิธีขออนุญาตไปราชการ?",
    "ไปราชการต้องเตรียมเอกสารอะไร?",
    "ใครอนุมัติการไปราชการ?",
    "สถานะคำขอไปราชการ?",
  ],
  "/": [
    "สรุปภาพรวมงานวันนี้",
    "มีงานค้างอะไรบ้าง?",
    "เอกสารเข้าล่าสุดเกี่ยวกับอะไร?",
    "ระบบ NextOffice ช่วยอะไรได้บ้าง?",
  ],
};

const PAGE_LABELS: Record<string, string> = {
  "/saraban/inbound": "ทะเบียนรับ",
  "/saraban/outbound": "ทะเบียนส่ง",
  "/inbox": "เอกสารเข้า",
  "/cases": "เคส",
  "/documents": "คลังเอกสาร",
  "/intakes": "AI ประมวลผล",
  "/outbound": "หนังสือส่งออก",
  "/horizon": "Horizon",
  "/horizon/agendas": "วาระนโยบาย",
  "/horizon/signals": "สัญญาณ",
  "/attendance": "ลงเวลา",
  "/attendance/check-in": "ลงเวลาเข้า/ออก",
  "/attendance/face": "ลงทะเบียนใบหน้า",
  "/attendance/history": "ประวัติลงเวลา",
  "/attendance/report": "รายงานลงเวลา",
  "/leave": "ระบบลา",
  "/leave/new": "ส่งใบลา",
  "/leave/approvals": "รออนุมัติ",
  "/leave/travel": "ไปราชการ",
  "/leave/travel/new": "ขอไปราชการ",
  "/vault": "Knowledge Vault",
  "/projects": "โครงการ",
  "/work-groups": "โครงสร้างองค์กร",
  "/knowledge": "ฐานความรู้",
  "/notifications": "แจ้งเตือน",
  "/": "แดชบอร์ด",
};

function getPageLabel(pathname: string): string | null {
  // Exact match
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];
  // Detail page match: /inbox/123 → "เอกสารเข้า #123"
  const inboxMatch = pathname.match(/^\/inbox\/(\d+)$/);
  if (inboxMatch) return `เอกสารเข้า #${inboxMatch[1]}`;
  const caseMatch = pathname.match(/^\/cases\/(\d+)$/);
  if (caseMatch) return `เคส #${caseMatch[1]}`;
  const docMatch = pathname.match(/^\/documents\/(\d+)$/);
  if (docMatch) return `เอกสาร #${docMatch[1]}`;
  return null;
}

function getSuggestions(pathname: string): string[] {
  // Exact match
  if (PAGE_SUGGESTIONS[pathname]) return PAGE_SUGGESTIONS[pathname];
  // Detail pages get specific suggestions
  if (/^\/inbox\/\d+$/.test(pathname) || /^\/cases\/\d+$/.test(pathname)) {
    return [
      "สรุปเนื้อหาหนังสือฉบับนี้",
      "หนังสือนี้ต้องดำเนินการอะไรต่อ?",
      "มีระเบียบอะไรที่เกี่ยวข้อง?",
      "แนะนำแนวทางตอบหนังสือฉบับนี้",
    ];
  }
  return DEFAULT_SUGGESTIONS;
}

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
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build page context from current route
  const pageContext = useMemo<PageContext>(() => {
    const ctx: PageContext = { route: pathname };

    // Extract entity ID from detail routes
    const idMatch = pathname.match(/\/(\d+)$/);
    if (idMatch) {
      ctx.entityId = Number(idMatch[1]);
    }

    // Capture search/filter params
    const search = searchParams.get("search");
    if (search) ctx.searchQuery = search;

    const filterKeys = ["status", "urgencyLevel", "dateFrom", "dateTo", "organizationId"];
    const filters: Record<string, string> = {};
    for (const key of filterKeys) {
      const val = searchParams.get(key);
      if (val) filters[key] = val;
    }
    if (Object.keys(filters).length > 0) ctx.filters = filters;

    return ctx;
  }, [pathname, searchParams]);

  const pageLabel = getPageLabel(pathname);
  const suggestions = getSuggestions(pathname);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Clear chat when navigating to a different page
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      // Don't auto-clear — keep history but user can clear manually
    }
  }, [pathname]);

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
        {
          method: "POST",
          body: JSON.stringify({
            query: trimmed,
            pageContext,
          }),
        },
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
        <div className="shrink-0 px-4 py-3 border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <div className="bg-secondary p-1.5 rounded-lg shadow-sm shadow-secondary/20">
              <Bot size={14} className="text-on-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-black text-primary uppercase tracking-wider">AI NextOffice</h3>
              <p className="text-[10px] text-on-surface-variant truncate">
                ถามเรื่องระเบียบ + ข้อมูลในหน้านี้
              </p>
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

          {/* Page context indicator */}
          {pageLabel && (
            <div className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-primary-fixed/20 rounded-lg">
              <MapPin size={10} className="text-primary shrink-0" />
              <span className="text-[10px] font-semibold text-primary truncate">
                {pageLabel}
              </span>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-2">
              <div className="bg-secondary/10 p-3 rounded-2xl mb-3">
                <Bot size={24} className="text-secondary" />
              </div>
              <p className="text-xs text-on-surface-variant mb-1">
                AI ผู้ช่วยงานสารบรรณ NextOffice
              </p>
              {pageLabel && (
                <p className="text-[10px] text-primary font-semibold mb-3">
                  พร้อมช่วยเหลือเรื่อง {pageLabel}
                </p>
              )}
              {!pageLabel && (
                <p className="text-[10px] text-on-surface-variant mb-3">
                  ถามคำถามเกี่ยวกับระเบียบหรือข้อมูลในหน้าปัจจุบัน
                </p>
              )}
              <div className="space-y-1.5 w-full">
                {suggestions.map((s) => (
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
              placeholder={pageLabel ? `ถามเกี่ยวกับ ${pageLabel}...` : "พิมพ์คำถามของคุณ..."}
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
