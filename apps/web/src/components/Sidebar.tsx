"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import DocumentUploadModal from "./DocumentUploadModal";
import { getUser } from "@/lib/auth";
import {
  FolderOpen,
  Building2,
  HelpCircle,
  FilePlus,
  Shield,
  ScrollText,
  BookOpen,
  Users,
  Inbox,
  ClipboardList,
  SlidersHorizontal,
  Radar,
  Globe,
  CalendarClock,
  Newspaper,
  FolderKanban,
  GitFork,
  Network,
  Clock,
  Upload,
  CalendarDays,
  MapPin,
  CheckSquare,
  ChevronDown,
  QrCode,
  PenLine,
  MessageCircle,
  Sparkles,
  FileText,
  BarChart3,
  Download,
  ChevronLeft,
  X,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
  disabled?: boolean;
  badge?: number;
  children?: Omit<NavItem, "icon" | "children">[];
};

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
      { href: "/saraban/reports", label: "สถิติการใช้งาน", icon: BarChart3, roles: SARABAN },
      { href: "/cases", label: "รายงานเอกสารค้างรับ", icon: ClipboardList },
      { href: "/track", label: "ติดตาม QR Code", icon: QrCode },
      { href: "/director/signing", label: "รอลงนาม ผอ.", icon: PenLine, roles: ["DIRECTOR", "VICE_DIRECTOR"] },
    ],
  },
  {
    id: "documents",
    label: "Documents",
    items: [
      {
        href: "/inbox",
        label: "รับ-ส่งเอกสาร",
        icon: Inbox,
        children: [
          { href: "/inbox", label: "เอกสารเข้า" },
          { href: "/outbound/new", label: "ส่งเอกสาร", roles: SARABAN },
          { href: "/saraban/inbound", label: "ทะเบียนรับ", roles: SARABAN },
          { href: "/saraban/outbound", label: "ทะเบียนส่ง", roles: SARABAN },
        ],
      },
      {
        href: "/presentation",
        label: "แฟ้มนำเสนอ",
        icon: FolderKanban,
        children: [
          { href: "/presentation", label: "รับแฟ้มนำเสนอ" },
          { href: "/presentation/send", label: "ส่งแฟ้มนำเสนอ" },
          { href: "/presentation/register-in", label: "ทะเบียนแฟ้มรับ" },
          { href: "/presentation/register-out", label: "ทะเบียนแฟ้มส่ง" },
        ],
      },
      {
        href: "/saraban/external",
        label: "สารบรรณหน่วยงาน",
        icon: ScrollText,
        children: [
          { href: "/outbound/new", label: "ออกเลขหนังสือส่ง", roles: SARABAN },
          { href: "/inbox", label: "รับเอกสารนอกระบบ" },
          { href: "/saraban/external", label: "หนังสือภายนอก" },
          { href: "/saraban/memo", label: "หนังสือภายใน" },
          { href: "/saraban/directive?sub=order", label: "หนังสือสั่งการ / คำสั่ง" },
          { href: "/saraban/pr?sub=announcement", label: "หนังสือประชาสัมพันธ์" },
          { href: "/saraban/stamp-doc", label: "หนังสือประทับตรา" },
          { href: "/saraban/email", label: "ไปรษณีย์อิเล็กทรอนิกส์" },
          { href: "/saraban/circular", label: "ออกเลขหนังสือเวียน" },
          { href: "/saraban/e-doc", label: "หนังสืออิเล็กทรอนิกส์" },
        ],
      },
    ],
  },
  {
    id: "eservice-main",
    label: "E-Service",
    items: [
      { href: "/messages", label: "ข้อความส่วนตัว", icon: MessageCircle },
      { href: "/webboard", label: "เว็บบอร์ด", icon: Globe },
      { href: "/news", label: "ข่าวประชาสัมพันธ์", icon: Newspaper },
      { href: "/tender", label: "ข่าวประกวดราคา", icon: FileText },
      { href: "/calendar", label: "ปฏิทินภารกิจ", icon: CalendarDays },
    ],
  },
  {
    id: "backoffice",
    label: "Back Office",
    items: [
      {
        href: "/documents",
        label: "จัดเก็บเอกสาร",
        icon: FolderOpen,
        children: [
          { href: "/documents", label: "คลังเอกสาร" },
          { href: "/saraban/archive", label: "เก็บเอกสาร / ทำลาย", roles: SARABAN },
          { href: "/saraban/loans", label: "ยืม-คืนเอกสาร", roles: SARABAN },
          { href: "/saraban/handover", label: "ส่งมอบครบ 20 ปี", roles: SARABAN },
          { href: "/saraban/send-store", label: "บัญชีหนังสือส่งเก็บ" },
          { href: "/saraban/stored-register", label: "ทะเบียนหนังสือเก็บ" },
          { href: "/saraban/destroy-list", label: "บัญชีหนังสือขอทำลาย" },
        ],
      },
      { href: "/download", label: "ดาวน์โหลด", icon: Download },
      { href: "/reports/district", label: "รายงานระดับเขต", icon: Network, roles: MANAGER },
    ],
  },
  {
    id: "attendance",
    label: "ลงเวลาปฏิบัติงาน",
    items: [
      { href: "/attendance", label: "ลงเวลา", icon: Clock },
      { href: "/leave", label: "ลาหยุด", icon: CalendarDays },
      { href: "/leave/travel", label: "ไปราชการ", icon: MapPin },
      { href: "/leave/approvals", label: "รออนุมัติ", icon: CheckSquare, roles: APPROVER },
    ],
  },
  {
    id: "intelligence",
    label: "จัดการงานอัจฉริยะ",
    items: [
      { href: "/horizon", label: "ภาพรวม Horizon", icon: Radar, roles: MANAGER },
      { href: "/horizon/sources", label: "แหล่งข้อมูล", icon: Globe, roles: ["ADMIN"] },
      { href: "/horizon/agendas", label: "วาระนโยบาย", icon: CalendarClock, roles: MANAGER },
      { href: "/horizon/signals", label: "สัญญาณ", icon: Newspaper, roles: MANAGER },
      { href: "/knowledge/import", label: "นำเข้าความรู้", icon: Upload },
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
      { href: "/settings/staff", label: "บุคลากรผู้ลงนาม", icon: Users, roles: ["ADMIN", "DIRECTOR"] },
      { href: "/settings/prompts", label: "ตั้งค่า AI Prompts", icon: SlidersHorizontal, roles: ["ADMIN", "DIRECTOR"] },
      { href: "/admin/chat-analytics", label: "Chat Analytics", icon: Sparkles, roles: ["ADMIN", "DIRECTOR"] },
      { href: "/organizations", label: "หน่วยงาน", icon: Building2, roles: ["ADMIN"] },
      { href: "/settings/line-accounts", label: "เชื่อมต่อ LINE", icon: MessageCircle, roles: ["ADMIN", "DIRECTOR"] },
    ],
  },
  {
    id: "help",
    label: "ช่วยเหลือ & ข้อมูล",
    items: [
      { href: "/terms", label: "ข้อกำหนดการใช้บริการ", icon: ScrollText },
      { href: "/privacy", label: "นโยบายความเป็นส่วนตัว", icon: Shield },
      { href: "/about", label: "เกี่ยวกับ Next Office", icon: Building2 },
    ],
  },
];

function filterItems(items: NavItem[], roleCode: string): NavItem[] {
  return items
    .filter((item) => !item.roles || item.roles.includes(roleCode))
    .map((item) =>
      item.children
        ? {
            ...item,
            children: item.children.filter(
              (c) => !c.roles || c.roles.includes(roleCode),
            ),
          }
        : item,
    );
}

function matches(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}

function itemIsActive(item: NavItem, pathname: string): boolean {
  if (matches(pathname, item.href)) return true;
  return (item.children ?? []).some((c) => matches(pathname, c.href));
}

/** Renders a single top-level nav item (optionally with collapsible children). */
function SideMenuItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const hasChildren = !!item.children && item.children.length > 0;
  const active = itemIsActive(item, pathname);
  // Tri-state: null = follow "active" prop; true/false = user override.
  // This keeps the accordion open on navigation without needing a setState-in-effect.
  const [manual, setManual] = useState<boolean | null>(null);
  const expanded = manual === null ? active : manual;
  const toggle = () => setManual(!expanded);

  if (item.disabled) {
    return (
      <div className="side-menu__link opacity-50 cursor-not-allowed">
        <Icon className="side-menu__link__icon" />
        <span className="side-menu__link__title">{item.label}</span>
        <span className="side-menu__link__badge">เร็วๆ นี้</span>
      </div>
    );
  }

  if (!hasChildren) {
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        className={clsx("side-menu__link", active && "side-menu__link--active")}
      >
        <Icon className="side-menu__link__icon" />
        <span className="side-menu__link__title">{item.label}</span>
        {item.badge != null && <span className="side-menu__link__badge">{item.badge}</span>}
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className={clsx("side-menu__link w-full", active && "side-menu__link--active")}
      >
        <Icon className="side-menu__link__icon" />
        <span className="side-menu__link__title">{item.label}</span>
        <ChevronDown
          className={clsx(
            "side-menu__link__chevron",
            expanded ? "rotate-180" : "",
          )}
        />
      </button>
      {expanded && (
        <div className="side-menu__sub">
          {item.children!.map((c) => {
            const childActive = matches(pathname, c.href);
            return (
              <Link
                key={`${item.href}::${c.href}::${c.label}`}
                href={c.href}
                onClick={onNavigate}
                className={clsx(
                  "side-menu__link",
                  childActive && "side-menu__link--active",
                )}
              >
                <span className="side-menu__link__icon inline-flex items-center justify-center">
                  <span
                    className={clsx(
                      "w-1.5 h-1.5 rounded-full",
                      childActive ? "bg-current" : "bg-current opacity-50",
                    )}
                  />
                </span>
                <span className="side-menu__link__title">{c.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface SidebarProps {
  compactMenu: boolean;
  compactMenuOnHover: boolean;
  mobileMenuOpen: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleCompact: () => void;
  onCloseMobile: () => void;
}

function subscribeUser(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function getRoleCode(): string {
  return getUser()?.roleCode ?? "TEACHER";
}

export default function Sidebar({
  compactMenu,
  compactMenuOnHover,
  mobileMenuOpen,
  onMouseEnter,
  onMouseLeave,
  onToggleCompact,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname() ?? "/";
  const [uploadOpen, setUploadOpen] = useState(false);
  // Read role reactively from localStorage via useSyncExternalStore — updates
  // if the impersonation flow swaps the stored user.
  const roleCode = useSyncExternalStore(subscribeUser, getRoleCode, () => "TEACHER");

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({ ...g, items: filterItems(g.items, roleCode) }))
        .filter((g) => g.items.length > 0),
    [roleCode],
  );

  // Collapse state — hide text when compact & not hovered
  const showText = !compactMenu || compactMenuOnHover;

  return (
    <>
      <aside
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={clsx(
          "rubick-sidebar side-menu fixed top-0 left-0 z-50 h-screen flex flex-col overflow-hidden transition-[width,transform] duration-200",
          "w-[275px] xl:translate-x-0",
          compactMenu && !compactMenuOnHover && "xl:w-[80px] side-menu--collapsed",
          compactMenu && compactMenuOnHover && "xl:w-[275px] side-menu--collapsed side-menu--on-hover",
          // Mobile drawer
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full xl:translate-x-0",
        )}
      >
      {/* Mobile close button */}
      {mobileMenuOpen && (
        <button
          onClick={onCloseMobile}
          className="xl:hidden absolute top-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-white/80 hover:bg-white/20"
          aria-label="ปิดเมนู"
        >
          <X size={16} />
        </button>
      )}

      {/* Brand */}
      <div className="relative flex items-center gap-3 px-5 h-[65px] flex-none">
        <Image
          src="/Favicon.png"
          alt="NextOffice"
          width={34}
          height={34}
          className="relative rounded-xl shadow-lg flex-none"
        />
        {showText && (
          <div className="min-w-0">
            <span
              className="text-base font-bold leading-tight block truncate"
              style={{
                background: "linear-gradient(135deg, #e0e7ff, #ddd6fe, #f3e8ff)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Next Office
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              <Sparkles size={8} className="text-violet-300 opacity-80" />
              <p className="text-[9px] uppercase tracking-widest text-white/45 font-bold">
                Education AI
              </p>
            </div>
          </div>
        )}
        {/* Compact toggle — xl+ only */}
        <button
          onClick={onToggleCompact}
          title={compactMenu ? "ขยายเมนู" : "ย่อเมนู"}
          className="ml-auto hidden 2xl:flex items-center justify-center w-7 h-7 rounded-md border border-white/15 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ChevronLeft
            size={14}
            className={clsx("transition-transform duration-200", compactMenu && "rotate-180")}
          />
        </button>
      </div>

      {/* New Document Upload CTA */}
      <div className="relative px-4 mb-3 flex-none">
        <button
          onClick={() => setUploadOpen(true)}
          title="เอกสารใหม่ด้วย AI"
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-bold text-white rounded-xl transition-transform active:scale-95"
          style={{
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            boxShadow:
              "0 4px 20px rgba(124, 58, 237, 0.4), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          <FilePlus size={14} className="flex-none" />
          {showText && <span className="truncate">+ เอกสารใหม่ด้วย AI</span>}
        </button>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 px-3 pb-4 overflow-y-auto sidebar-scrollbar">
        {groups.map((group) => (
          <div key={group.id} className="mb-2">
            <div className="side-menu__group-label">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SideMenuItem
                  key={`${group.id}::${item.href}::${item.label}`}
                  item={item}
                  pathname={pathname}
                  onNavigate={mobileMenuOpen ? onCloseMobile : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom help link */}
      <div className="relative px-3 pb-4 pt-2 flex-none border-t border-white/5">
        <Link
          href="/help"
          onClick={mobileMenuOpen ? onCloseMobile : undefined}
          className="side-menu__link"
        >
          <HelpCircle className="side-menu__link__icon" />
          <span className="side-menu__link__title">ศูนย์ช่วยเหลือ</span>
        </Link>
      </div>
      </aside>

      {/* Rendered outside the aside so the fixed-overlay modal isn't
          trapped by the sidebar's transform-induced containing block. */}
      <DocumentUploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  );
}
