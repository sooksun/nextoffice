"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import DocumentUploadModal from "./DocumentUploadModal";
import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  Briefcase,
  Building2,
  MessageSquareText,
  HelpCircle,
  FilePlus,
  Shield,
  ScrollText,
  BookOpen,
  Send,
  BarChart3,
  Users,
  Inbox,
  BellRing,
  ClipboardList,
  SendHorizontal,
} from "lucide-react";

const documentFlowLinks = [
  { href: "/inbox", label: "เอกสารเข้า", icon: Inbox },
  { href: "/outbound/new", label: "ส่งเอกสาร", icon: SendHorizontal },
  { href: "/saraban/inbound", label: "ทะเบียนรับ", icon: ClipboardList },
  { href: "/saraban/outbound", label: "ทะเบียนส่ง", icon: Send },
];

const toolLinks = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/notifications", label: "การแจ้งเตือนงาน", icon: BellRing },
  { href: "/chat", label: "AI สารบรรณ", icon: MessageSquareText },
  { href: "/intakes", label: "AI ประมวลผลเอกสาร", icon: FileText },
  { href: "/documents", label: "คลังเอกสาร", icon: FolderOpen },
  { href: "/cases", label: "เคส", icon: Briefcase },
  { href: "/saraban/reports", label: "รายงาน", icon: BarChart3 },
];

const adminLinks = [
  { href: "/work-groups", label: "โครงสร้างองค์กร", icon: Users },
  { href: "/knowledge", label: "ฐานข้อมูลความรู้", icon: BookOpen },
  { href: "/organizations", label: "หน่วยงาน", icon: Building2 },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [uploadOpen, setUploadOpen] = useState(false);
  return (
    <aside className="w-64 shrink-0 bg-surface-low flex flex-col border-r border-outline-variant/20 font-[family-name:var(--font-be-vietnam-pro)] text-sm font-medium">
      {/* Brand */}
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v18"/>
            <path d="M3 12h18"/>
            <path d="M3.5 5.5l17 13"/>
            <path d="M20.5 5.5l-17 13"/>
          </svg>
        </div>
        <div>
          <span className="text-xl font-bold text-primary leading-tight block">Next Office</span>
          <p className="text-[10px] uppercase tracking-widest text-outline font-bold">Education AI</p>
        </div>
      </div>

      {/* New Document Upload */}
      <div className="px-4 mb-4">
        <button
          onClick={() => setUploadOpen(true)}
          className="w-full py-3 px-4 bg-primary text-on-primary rounded-2xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95"
        >
          <FilePlus size={14} />
          <span>+ เอกสารใหม่</span>
        </button>
      </div>
      <DocumentUploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} />

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        <div className="px-4 pt-1 pb-1">
          <p className="text-[10px] uppercase tracking-widest text-outline font-bold">รับ-ส่งเอกสาร</p>
        </div>
        {documentFlowLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link key={href} href={href} className={clsx("flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-colors", isActive ? "bg-primary/10 text-primary font-bold" : "text-on-surface-variant hover:text-primary hover:bg-surface-bright")}>
              <Icon size={18} />
              {label}
            </Link>
          );
        })}

        <div className="px-4 pt-3 pb-1">
          <p className="text-[10px] uppercase tracking-widest text-outline font-bold">เครื่องมือ AI</p>
        </div>
        {toolLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link key={href} href={href} className={clsx("flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-colors", isActive ? "bg-primary/10 text-primary font-bold" : "text-on-surface-variant hover:text-primary hover:bg-surface-bright")}>
              <Icon size={18} />
              {label}
            </Link>
          );
        })}

        <div className="px-4 pt-3 pb-1">
          <p className="text-[10px] uppercase tracking-widest text-outline font-bold">จัดการ</p>
        </div>
        {adminLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link key={href} href={href} className={clsx("flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-colors", isActive ? "bg-primary/10 text-primary font-bold" : "text-on-surface-variant hover:text-primary hover:bg-surface-bright")}>
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 mt-auto border-t border-outline-variant/20 space-y-0.5">
        <Link
          href="/terms"
          className="flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs text-on-surface-variant hover:text-primary hover:bg-surface-bright transition-colors"
        >
          <ScrollText size={16} />
          ข้อกำหนดการใช้บริการ
        </Link>
        <Link
          href="/privacy"
          className="flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs text-on-surface-variant hover:text-primary hover:bg-surface-bright transition-colors"
        >
          <Shield size={16} />
          นโยบายความเป็นส่วนตัว
        </Link>
        <Link
          href="/help"
          className="flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs text-on-surface-variant hover:text-primary hover:bg-surface-bright transition-colors"
        >
          <HelpCircle size={16} />
          ศูนย์ช่วยเหลือ
        </Link>
      </div>
    </aside>
  );
}
