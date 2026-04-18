"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Search,
  FileText,
  Users,
  Inbox as InboxIcon,
  Settings as SettingsIcon,
  Folder,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

/**
 * Cmd/Ctrl+K quick launcher.
 *
 * Two data sources mixed:
 * 1. Static route index — instant, always shown when query is empty or short.
 * 2. Live API — `/search/quick?q=…` debounced at 200 ms; shown whenever query ≥ 2.
 */

interface StaticEntry {
  label: string;
  href: string;
  group: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  keywords?: string[];
}

interface ApiHit {
  type: "case" | "document" | "user";
  id: number;
  title: string;
  subtitle?: string | null;
  href: string;
}

interface ApiResponse {
  q: string;
  hits: ApiHit[];
}

const STATIC_ENTRIES: StaticEntry[] = [
  { label: "ภาพรวม", href: "/", group: "เมนู", icon: InboxIcon, keywords: ["home", "dashboard"] },
  { label: "เอกสารเข้า (Inbox)", href: "/inbox", group: "เอกสาร", icon: InboxIcon },
  { label: "คลังเอกสาร", href: "/documents", group: "เอกสาร", icon: Folder, keywords: ["documents"] },
  { label: "เอกสารค้างรับ", href: "/cases", group: "เอกสาร", icon: FileText },
  { label: "ส่งเอกสาร", href: "/outbound/new", group: "เอกสาร", icon: FileText },
  { label: "แฟ้มนำเสนอ", href: "/presentation", group: "เอกสาร", icon: Folder },
  { label: "สารบรรณหน่วยงาน", href: "/saraban/external", group: "สารบรรณ", icon: FileText },
  { label: "ทะเบียนรับ", href: "/saraban/inbound", group: "สารบรรณ", icon: FileText },
  { label: "ทะเบียนส่ง", href: "/saraban/outbound", group: "สารบรรณ", icon: FileText },
  { label: "ลงเวลา", href: "/attendance", group: "งาน", icon: InboxIcon },
  { label: "ลาหยุด", href: "/leave", group: "งาน", icon: FileText },
  { label: "ไปราชการ", href: "/leave/travel", group: "งาน", icon: FileText },
  { label: "นำเข้าความรู้", href: "/knowledge/import", group: "ความรู้", icon: Folder },
  { label: "บันทึกความรู้ (Vault)", href: "/vault", group: "ความรู้", icon: Folder },
  { label: "Knowledge Graph", href: "/vault/graph", group: "ความรู้", icon: Folder },
  { label: "ภาพรวม Horizon", href: "/horizon", group: "Horizon", icon: FileText },
  { label: "โครงสร้างองค์กร", href: "/work-groups", group: "จัดการ", icon: Users },
  { label: "หน่วยงาน", href: "/organizations", group: "จัดการ", icon: Users },
  { label: "ตั้งค่า AI Prompts", href: "/settings/prompts", group: "จัดการ", icon: SettingsIcon },
  { label: "เชื่อมต่อ LINE", href: "/settings/line-accounts", group: "จัดการ", icon: SettingsIcon },
  { label: "Chat Analytics", href: "/admin/chat-analytics", group: "จัดการ", icon: FileText },
];

const TYPE_META: Record<ApiHit["type"], { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  case: { label: "เอกสารเข้า", icon: InboxIcon },
  document: { label: "คลังเอกสาร", icon: Folder },
  user: { label: "บุคลากร", icon: Users },
};

type DisplayHit =
  | { kind: "static"; entry: StaticEntry }
  | { kind: "api"; entry: ApiHit };

export default function QuickSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [apiHits, setApiHits] = useState<ApiHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqIdRef = useRef(0);

  // Reset on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setActiveIdx(0);
      setApiHits([]);
    }
  }, [open]);

  // Debounced API search
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setApiHits([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const myReq = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      try {
        const res = await apiFetch<ApiResponse>(`/search/quick?q=${encodeURIComponent(term)}&limit=5`);
        if (myReq === reqIdRef.current) setApiHits(res.hits ?? []);
      } catch {
        if (myReq === reqIdRef.current) setApiHits([]);
      } finally {
        if (myReq === reqIdRef.current) setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  // Static filter (runs against query too)
  const staticFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return STATIC_ENTRIES;
    return STATIC_ENTRIES.filter((e) => {
      const hay = `${e.label} ${e.keywords?.join(" ") ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  const flat: DisplayHit[] = useMemo(() => {
    const arr: DisplayHit[] = [];
    apiHits.forEach((h) => arr.push({ kind: "api", entry: h }));
    staticFiltered.forEach((e) => arr.push({ kind: "static", entry: e }));
    return arr;
  }, [apiHits, staticFiltered]);

  // Group for rendering
  const groups = useMemo(() => {
    const byGroup: Record<string, DisplayHit[]> = {};
    // API hits grouped by type
    apiHits.forEach((h) => {
      const gname = TYPE_META[h.type].label;
      (byGroup[gname] ??= []).push({ kind: "api", entry: h });
    });
    // Static hits by their group
    staticFiltered.forEach((e) => {
      (byGroup[e.group] ??= []).push({ kind: "static", entry: e });
    });
    return byGroup;
  }, [apiHits, staticFiltered]);

  useEffect(() => {
    if (activeIdx >= flat.length) setActiveIdx(0);
  }, [flat.length, activeIdx]);

  function hrefOf(d: DisplayHit): string {
    return d.kind === "static" ? d.entry.href : d.entry.href;
  }

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % Math.max(flat.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + flat.length) % Math.max(flat.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = flat[activeIdx];
      if (pick) go(hrefOf(pick));
    }
  }

  let runningIdx = 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className="fixed left-1/2 top-[12%] z-50 w-[90vw] max-w-xl -translate-x-1/2 rounded-2xl border border-outline-variant/60 bg-surface-bright shadow-2xl overflow-hidden outline-none"
        >
          <Dialog.Title className="sr-only">ค้นหาอย่างรวดเร็ว</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-outline-variant/40 px-4 py-3">
            {searching ? (
              <Loader2 size={18} className="text-primary animate-spin" />
            ) : (
              <Search size={18} className="text-on-surface-variant" />
            )}
            <input
              ref={inputRef}
              type="text"
              placeholder="ค้นหาหน้า เอกสาร เคส หรือบุคลากร…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/60 outline-none"
            />
            <kbd className="hidden sm:inline-flex h-6 items-center rounded-md border border-outline-variant/60 bg-surface-low px-1.5 text-[10px] font-semibold text-on-surface-variant">
              esc
            </kbd>
          </div>

          <div className="max-h-[60vh] overflow-y-auto py-2">
            {flat.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-on-surface-variant">
                {query.trim().length < 2 ? "พิมพ์อย่างน้อย 2 ตัวอักษร" : "ไม่พบผลลัพธ์"}
              </div>
            ) : (
              Object.entries(groups).map(([groupName, entries]) => (
                <div key={groupName} className="py-1">
                  <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">
                    {groupName}
                  </div>
                  {entries.map((d) => {
                    const isActive = runningIdx === activeIdx;
                    const currentIdx = runningIdx++;
                    const label = d.kind === "static" ? d.entry.label : d.entry.title;
                    const subtitle = d.kind === "api" ? d.entry.subtitle : undefined;
                    const Icon =
                      d.kind === "static"
                        ? d.entry.icon
                        : TYPE_META[d.entry.type].icon;
                    return (
                      <button
                        key={`${d.kind}-${d.kind === "static" ? d.entry.href : d.entry.id}-${currentIdx}`}
                        onMouseEnter={() => setActiveIdx(currentIdx)}
                        onClick={() => go(hrefOf(d))}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-on-surface hover:bg-surface-low"
                        }`}
                      >
                        <Icon size={15} className={isActive ? "text-primary" : "text-on-surface-variant"} />
                        <div className="flex-1 min-w-0">
                          <span className="block truncate">{label}</span>
                          {subtitle && (
                            <span className="block text-[11px] text-on-surface-variant/80 truncate">
                              {subtitle}
                            </span>
                          )}
                        </div>
                        {isActive && <ArrowRight size={14} />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-outline-variant/40 bg-surface-low px-4 py-2 text-[11px] text-on-surface-variant">
            <div className="flex items-center gap-3">
              <span>↑↓ เลื่อน</span>
              <span>↵ เลือก</span>
            </div>
            <span>{flat.length} รายการ</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
