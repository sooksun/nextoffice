"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import DocumentUploadModal from "./DocumentUploadModal";
import { getUser } from "@/lib/auth";
import {
  LayoutDashboard,
  FolderOpen,
  Briefcase,
  Building2,
  HelpCircle,
  FilePlus,
  Shield,
  ScrollText,
  BookOpen,
  Send,
  Users,
  Inbox,
  BellRing,
  ClipboardList,
  SendHorizontal,
  SlidersHorizontal,
  Radar,
  Globe,
  CalendarClock,
  Newspaper,
  FolderKanban,
  GitFork,
  Network,
  Clock,
  CalendarDays,
  MapPin,
  CheckSquare,
  ChevronDown,
} from "lucide-react";

// undefined = ทุก role เห็นได้
type NavItem = { href: string; label: string; icon: React.ElementType; roles?: string[] };

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const MANAGER = ["DIRECTOR", "VICE_DIRECTOR", "ADMIN"];
const SARABAN = ["CLERK", "DIRECTOR", "VICE_DIRECTOR", "ADMIN"];
const APPROVER = ["DIRECTOR", "VICE_DIRECTOR", "HEAD_TEACHER", "ADMIN"];

const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "ภาพรวม",
    items: [
      { href: "/director", label: "แดชบอร์ด", icon: LayoutDashboard, roles: MANAGER },
      { href: "/inbox", label: "หน้าหลัก", icon: LayoutDashboard, roles: ["TEACHER", "HEAD_TEACHER", "CLERK"] },
      { href: "/notifications", label: "การแจ้งเตือน", icon: BellRing },
    ],
  },
  {
    id: "document",
    label: "รับ-ส่งเอกสาร",
    items: [
      { href: "/inbox", label: "หนังสือเข้า", icon: Inbox },
      { href: "/outbound", label: "หนังสือออก", icon: SendHorizontal },
      { href: "/outbound/new", label: "สร้างหนังสือออก", icon: Send, roles: SARABAN },
      { href: "/saraban/inbound", label: "ทะเบียนรับ", icon: ClipboardList, roles: SARABAN },
      { href: "/saraban/outbound", label: "ทะเบียนส่ง", icon: ScrollText, roles: SARABAN },
    ],
  },
  {
    id: "eservice",
    label: "E-SERVICE",
    items: [
      { href: "/attendance", label: "ลงเวลา", icon: Clock },
      { href: "/leave", label: "ลาหยุด", icon: CalendarDays },
      { href: "/leave/travel", label: "ไปราชการ", icon: MapPin },
      { href: "/leave/approvals", label: "รออนุมัติ", icon: CheckSquare, roles: APPROVER },
    ],
  },
  {
    id: "backoffice",
    label: "BACK OFFICE",
    items: [
      { href: "/documents", label: "คลังเอกสาร", icon: FolderOpen },
      { href: "/cases", label: "เคส", icon: Briefcase, roles: ["CLERK", "DIRECTOR", "VICE_DIRECTOR", "HEAD_TEACHER", "ADMIN"] },
      { href: "/saraban/reports", label: "รายงานสารบรรณ", icon: ScrollText, roles: SARABAN },
      { href: "/reports/district", label: "รายงานระดับเขต", icon: Network, roles: MANAGER },
    ],
  },
  {
    id: "intelligence",
    label: "INTELLIGENCE",
    items: [
      { href: "/horizon", label: "ภาพรวม Horizon", icon: Radar, roles: MANAGER },
      { href: "/horizon/sources", label: "แหล่งข้อมูล", icon: Globe, roles: ["ADMIN"] },
      { href: "/horizon/agendas", label: "วาระนโยบาย", icon: CalendarClock, roles: MANAGER },
      { href: "/horizon/signals", label: "สัญญาณ", icon: Newspaper, roles: MANAGER },
      { href: "/vault", label: "บันทึกความรู้", icon: BookOpen },
      { href: "/vault/graph", label: "Knowledge Graph", icon: GitFork },
      { href: "/vault/settings", label: "ตั้งค่า Vault", icon: SlidersHorizontal, roles: ["ADMIN"] },
      { href: "/projects", label: "โครงการ", icon: FolderKanban, roles: ["DIRECTOR", "VICE_DIRECTOR", "HEAD_TEACHER", "ADMIN"] },
    ],
  },
  {
    id: "admin",
    label: "จัดการ",
    items: [
      { href: "/work-groups", label: "โครงสร้างองค์กร", icon: Users, roles: ["ADMIN", "DIRECTOR"] },
      { href: "/knowledge", label: "จัดการนโยบาย/กฎหมาย", icon: BookOpen, roles: ["ADMIN"] },
      { href: "/settings/prompts", label: "ตั้งค่า AI Prompts", icon: SlidersHorizontal, roles: ["ADMIN", "DIRECTOR"] },
      { href: "/organizations", label: "หน่วยงาน", icon: Building2, roles: ["ADMIN"] },
    ],
  },
];

function filterItems(items: NavItem[], roleCode: string): NavItem[] {
  return items.filter((item) => !item.roles || item.roles.includes(roleCode));
}

function isGroupActive(items: NavItem[], pathname: string): boolean {
  return items.some(
    ({ href }) => pathname === href || (href !== "/" && pathname.startsWith(href)),
  );
}

function NavGroupSection({
  group,
  pathname,
  roleCode,
  defaultOpen,
}: {
  group: NavGroup;
  pathname: string;
  roleCode: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const visibleItems = filterItems(group.items, roleCode);

  if (visibleItems.length === 0) return null;

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 mt-1 text-[10px] uppercase tracking-widest text-outline font-bold hover:text-primary transition-colors group"
      >
        <span>{group.label}</span>
        <ChevronDown
          size={13}
          className={clsx(
            "transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      {/* Items */}
      <div
        className={clsx(
          "overflow-hidden transition-all duration-200",
          open ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="space-y-0.5 pb-1">
          {visibleItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-bold"
                    : "text-on-surface-variant hover:text-primary hover:bg-surface-bright",
                )}
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [roleCode, setRoleCode] = useState<string>("TEACHER");

  useEffect(() => {
    const user = getUser();
    if (user?.roleCode) setRoleCode(user.roleCode);
  }, []);

  return (
    <aside className="w-64 shrink-0 bg-surface-low flex flex-col border-r border-outline-variant/20 font-[family-name:var(--font-be-vietnam-pro)] text-sm font-medium">
      {/* Brand */}
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v18" />
            <path d="M3 12h18" />
            <path d="M3.5 5.5l17 13" />
            <path d="M20.5 5.5l-17 13" />
          </svg>
        </div>
        <div>
          <span className="text-xl font-bold text-primary leading-tight block">Next Office</span>
          <p className="text-[10px] uppercase tracking-widest text-outline font-bold">Education AI</p>
        </div>
      </div>

      {/* New Document Upload */}
      <div className="px-4 mb-3">
        <button
          onClick={() => setUploadOpen(true)}
          className="w-full py-3 px-4 bg-primary text-on-primary rounded-2xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95"
        >
          <FilePlus size={14} />
          <span>+ เอกสารใหม่ด้วย AI</span>
        </button>
      </div>
      <DocumentUploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} />

      {/* Nav — foldable groups */}
      <nav className="flex-1 px-3 overflow-y-auto custom-scrollbar">
        {NAV_GROUPS.map((group) => {
          const visibleItems = filterItems(group.items, roleCode);
          return (
            <NavGroupSection
              key={group.id}
              group={group}
              pathname={pathname}
              roleCode={roleCode}
              defaultOpen={isGroupActive(visibleItems, pathname) || group.id === "overview"}
            />
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
