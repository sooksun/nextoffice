"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, FileText, Users, Inbox as InboxIcon, Settings as SettingsIcon, Folder, ArrowRight } from "lucide-react";

/**
 * Cmd/Ctrl+K quick-launcher.
 * Phase-1 static index of routes — later will query /api/search across
 * documents, cases, users. Opens from Header trigger or keyboard shortcut.
 */

interface Entry {
  label: string;
  href: string;
  group: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  keywords?: string[];
}

const ENTRIES: Entry[] = [
  { label: "ภาพรวม", href: "/", group: "ภาพรวม", icon: InboxIcon, keywords: ["home", "dashboard"] },
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  // Filtered by group
  const { flat, byGroup } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q.length === 0
      ? ENTRIES
      : ENTRIES.filter((e) => {
          const hay = `${e.label} ${e.keywords?.join(" ") ?? ""}`.toLowerCase();
          return hay.includes(q);
        });
    const grouped: Record<string, Entry[]> = {};
    for (const e of list) {
      (grouped[e.group] ??= []).push(e);
    }
    return { flat: list, byGroup: grouped };
  }, [query]);

  // Clamp activeIdx to results length
  useEffect(() => {
    if (activeIdx >= flat.length) setActiveIdx(0);
  }, [flat.length, activeIdx]);

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
      if (flat[activeIdx]) go(flat[activeIdx].href);
    }
  }

  let runningIdx = 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className="fixed left-1/2 top-[15%] z-50 w-[90vw] max-w-xl -translate-x-1/2 rounded-2xl border border-outline-variant/60 bg-surface-bright shadow-2xl overflow-hidden outline-none"
        >
          <Dialog.Title className="sr-only">ค้นหาอย่างรวดเร็ว</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-outline-variant/40 px-4 py-3">
            <Search size={18} className="text-outline" />
            <input
              ref={inputRef}
              type="text"
              placeholder="ค้นหาหน้า เอกสาร หรือคำสั่ง…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-outline/60 outline-none"
            />
            <kbd className="hidden sm:inline-flex h-6 items-center rounded-md border border-outline-variant/60 bg-surface-low px-1.5 text-[10px] font-semibold text-outline">
              esc
            </kbd>
          </div>

          <div className="max-h-[60vh] overflow-y-auto py-2">
            {flat.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-outline">
                ไม่พบผลลัพธ์
              </div>
            ) : (
              Object.entries(byGroup).map(([group, entries]) => (
                <div key={group} className="py-1">
                  <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-outline/70">
                    {group}
                  </div>
                  {entries.map((e) => {
                    const isActive = runningIdx === activeIdx;
                    const currentIdx = runningIdx++;
                    const Icon = e.icon;
                    return (
                      <button
                        key={e.href}
                        onMouseEnter={() => setActiveIdx(currentIdx)}
                        onClick={() => go(e.href)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-on-surface hover:bg-surface-low"
                        }`}
                      >
                        <Icon size={15} className={isActive ? "text-primary" : "text-outline"} />
                        <span className="flex-1 truncate">{e.label}</span>
                        {isActive && <ArrowRight size={14} />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-outline-variant/40 bg-surface-low px-4 py-2 text-[11px] text-outline">
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
