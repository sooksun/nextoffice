"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
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
  Upload,
  CalendarDays,
  MapPin,
  CheckSquare,
  ChevronDown,
  Archive,
  QrCode,
  PenLine,
  MessageCircle,
  Sparkles,
  FileText,
  FileInput,
  Stamp,
  Gavel,
  ListChecks,
  Scale,
  Megaphone,
  Mail,
  Laptop,
  BookMarked,
  BarChart3,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: React.ElementType; roles?: string[]; disabled?: boolean; children?: Omit<NavItem, 'icon' | 'children'>[] };

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const MANAGER = ["DIRECTOR", "VICE_DIRECTOR", "ADMIN"];
const SARABAN = ["CLERK", "DIRECTOR", "VICE_DIRECTOR", "ADMIN"];
const APPROVER = ["DIRECTOR", "VICE_DIRECTOR", "HEAD_TEACHER", "ADMIN"];

const NAV_GROUPS: NavGroup[] = [
  // ─── หมวด 2: การรับและส่งหนังสือ ───────────────────────────────────
  {
    id: "inbound",
    label: "งานรับหนังสือ",
    items: [
      { href: "/inbox", label: "หนังสือเข้า", icon: Inbox },
      { href: "/cases", label: "เคส / ติดตามงาน", icon: Briefcase, roles: ["CLERK", "DIRECTOR", "VICE_DIRECTOR", "HEAD_TEACHER", "ADMIN"] },
      { href: "/track", label: "ติดตาม QR Code", icon: QrCode },
    ],
  },
  {
    id: "outbound",
    label: "งานส่งหนังสือ",
    items: [
      { href: "/outbound", label: "หนังสือออก", icon: SendHorizontal },
      { href: "/outbound/new", label: "สร้างหนังสือออก", icon: Send, roles: SARABAN },
      { href: "/director/signing", label: "รอลงนาม ผอ.", icon: PenLine, roles: ["DIRECTOR", "VICE_DIRECTOR"] },
    ],
  },

  // ─── หมวด 1: ชนิดของหนังสือ (ข้อ 10–27) ───────────────────────────
  {
    id: "doc-types",
    label: "หนังสือราชการ",
    items: [
      { href: "/saraban/external", label: "หนังสือภายนอก", icon: FileText },
      { href: "/saraban/memo", label: "หนังสือภายใน (บันทึกข้อความ)", icon: FileInput },
      { href: "/saraban/stamp-doc", label: "หนังสือประทับตรา", icon: Stamp },
    ],
  },
  {
    id: "directive",
    label: "หนังสือสั่งการ",
    items: [
      { href: "/saraban/directive?sub=order", label: "คำสั่ง", icon: Gavel },
      { href: "/saraban/directive?sub=regulation", label: "ระเบียบ", icon: ListChecks },
      { href: "/saraban/directive?sub=rule", label: "ข้อบังคับ", icon: Scale },
    ],
  },
  {
    id: "pr-doc",
    label: "หนังสือประชาสัมพันธ์",
    items: [
      { href: "/saraban/pr?sub=announcement", label: "ประกาศ", icon: Megaphone },
      { href: "/saraban/pr?sub=statement", label: "แถลงการณ์", icon: FileText },
      { href: "/saraban/pr?sub=news", label: "ข่าว", icon: Newspaper },
    ],
  },

  // ─── หมวด 3: ทะเบียน บัญชี และการเก็บรักษา ────────────────────────
  {
    id: "registers",
    label: "ทะเบียนและบัญชี",
    items: [
      { href: "/saraban/inbound", label: "ทะเบียนหนังสือรับ", icon: ClipboardList, roles: SARABAN },
      { href: "/saraban/outbound", label: "ทะเบียนหนังสือส่ง", icon: ScrollText, roles: SARABAN },
      { href: "/saraban/send-store", label: "บัญชีหนังสือส่งเก็บ", icon: BookMarked },
      { href: "/saraban/stored-register", label: "ทะเบียนหนังสือเก็บ", icon: Archive },
      { href: "/saraban/destroy-list", label: "บัญชีหนังสือขอทำลาย", icon: FolderOpen },
      { href: "/saraban/reports", label: "รายงานสารบรรณ", icon: BarChart3, roles: SARABAN },
      { href: "/reports/district", label: "รายงานระดับเขต", icon: Network, roles: MANAGER },
    ],
  },
  {
    id: "storage",
    label: "การเก็บรักษา ยืม และทำลาย",
    items: [
      { href: "/documents", label: "คลังเอกสาร", icon: FolderOpen },
      { href: "/saraban/archive", label: "เก็บเอกสาร / ทำลาย", icon: Archive, roles: SARABAN },
      { href: "/saraban/loans", label: "ยืม-คืนเอกสาร", icon: BookOpen, roles: SARABAN },
      { href: "/saraban/handover", label: "ส่งมอบครบ 20 ปี", icon: Archive, roles: SARABAN },
    ],
  },

  // ─── หมวด 5: ระบบสารบรรณอิเล็กทรอนิกส์ (ฉ.4/2564) ────────────────
  {
    id: "e-saraban",
    label: "ระบบสารบรรณอิเล็กทรอนิกส์",
    items: [
      { href: "/saraban/email", label: "ไปรษณีย์อิเล็กทรอนิกส์ (saraban@)", icon: Mail },
      { href: "/saraban/e-doc", label: "หนังสืออิเล็กทรอนิกส์", icon: Laptop },
    ],
  },

  // ─── ระบบอื่น (ไม่ใช่งานสารบรรณ) ────────────────────────────────────
  {
    id: "eservice",
    label: "ลงเวลาปฏิบัติงาน",
    items: [
      { href: "/calendar", label: "ปฏิทิน", icon: CalendarDays },
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
        ? { ...item, children: item.children.filter((c) => !c.roles || c.roles.includes(roleCode)) }
        : item,
    );
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
    <div className="mb-1">
      {/* Group header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[9px] uppercase tracking-widest text-white/35 font-bold hover:text-white/60 transition-colors group"
      >
        <span>{group.label}</span>
        <ChevronDown
          size={11}
          className={clsx(
            "transition-transform duration-200 opacity-60",
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
          {visibleItems.map(({ href, label, icon: Icon, children, disabled }) => {
            const isActive = !disabled &&
              (pathname === href || (href !== "/" && pathname.startsWith(href.split("?")[0])));
            const hasChildren = children && children.length > 0;
            return (
              <div key={href}>
                {disabled ? (
                  <span className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium cursor-not-allowed select-none">
                    <span className="flex items-center justify-center w-6 h-6 rounded-lg shrink-0 text-white/20">
                      <Icon size={14} />
                    </span>
                    <span className="truncate text-[13px] text-white/25">{label}</span>
                    <span className="ml-auto text-[8px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300/50 font-bold uppercase tracking-wider shrink-0 whitespace-nowrap">เร็วๆ นี้</span>
                  </span>
                ) : (
                <Link
                  href={href}
                  className={clsx(
                    "group/item flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-white/15 text-white shadow-sm border border-white/10"
                      : "text-white/60 hover:text-white/90 hover:bg-white/8",
                  )}
                >
                  {/* Active indicator line */}
                  {isActive && (
                    <span className="absolute left-0 w-0.5 h-5 rounded-r-full bg-gradient-to-b from-indigo-300 to-violet-400" />
                  )}
                  <span className={clsx(
                    "flex items-center justify-center w-6 h-6 rounded-lg transition-all duration-200 shrink-0",
                    isActive
                      ? "bg-gradient-to-br from-indigo-400/30 to-violet-400/30 text-indigo-200"
                      : "text-white/50 group-hover/item:text-white/80",
                  )}>
                    <Icon size={14} />
                  </span>
                  <span className="truncate text-[13px]">{label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-300 shrink-0" />
                  )}
                </Link>
                )}
                {hasChildren && (
                  <div className="ml-9 mt-0.5 space-y-0.5">
                    {children.map((child) => {
                      const childActive =
                        pathname + (typeof window !== "undefined" ? window.location.search : "") === child.href ||
                        child.href.split("?")[0] === pathname;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={clsx(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                            childActive
                              ? "bg-white/12 text-white"
                              : "text-white/45 hover:text-white/75 hover:bg-white/6",
                          )}
                        >
                          <span className={clsx(
                            "w-1 h-1 rounded-full shrink-0",
                            childActive ? "bg-indigo-300" : "bg-white/30"
                          )} />
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
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
    <aside
      className="relative w-64 shrink-0 flex flex-col font-[family-name:var(--font-be-vietnam-pro)] text-sm font-medium overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #0f172a 0%, #1e1b4b 45%, #2d1b69 100%)",
      }}
    >
      {/* Decorative background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-16 -left-16 w-48 h-48 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }}
        />
        <div
          className="absolute top-1/2 -right-20 w-56 h-56 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #6366f1, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #9333ea, transparent 70%)" }}
        />
      </div>

      {/* Brand */}
      <div className="relative px-4 py-5 flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-xl blur-md opacity-40"
            style={{ background: "linear-gradient(135deg, #6366f1, #9333ea)" }} />
          <Image
            src="/Favicon.png"
            alt="NextOffice"
            width={38}
            height={38}
            className="relative rounded-xl shadow-lg"
          />
        </div>
        <div>
          <span className="text-lg font-bold leading-tight block"
            style={{
              background: "linear-gradient(135deg, #e0e7ff, #ddd6fe, #f3e8ff)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
            Next Office
          </span>
          <div className="flex items-center gap-1 mt-0.5">
            <Sparkles size={8} className="text-violet-300 opacity-80" />
            <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Education AI</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 mb-3 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)" }} />

      {/* New Document Upload */}
      <div className="relative px-4 mb-4">
        <button
          onClick={() => setUploadOpen(true)}
          className="w-full py-2.5 px-4 flex items-center justify-center gap-2 text-sm font-bold text-white rounded-xl transition-all duration-200 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            boxShadow: "0 4px 20px rgba(124, 58, 237, 0.4), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 6px 28px rgba(124, 58, 237, 0.55), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 4px 20px rgba(124, 58, 237, 0.4), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)";
          }}
        >
          <FilePlus size={14} />
          <span>+ เอกสารใหม่ด้วย AI</span>
        </button>
      </div>
      <DocumentUploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} />

      {/* Nav — foldable groups */}
      <nav className="relative flex-1 px-2 overflow-y-auto sidebar-scrollbar">
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
        <div className="h-4" />
      </nav>

      {/* Divider */}
      <div className="mx-4 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)" }} />

      {/* Bottom help link */}
      <div className="relative px-2 pb-4 pt-2">
        <Link
          href="/help"
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/40 hover:text-white/70 hover:bg-white/8 transition-all duration-200"
        >
          <HelpCircle size={14} />
          ศูนย์ช่วยเหลือ
        </Link>
      </div>
    </aside>
  );
}
