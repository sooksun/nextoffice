"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, LogOut, Search, Menu as MenuIcon, Grid3x3 } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getUser, getToken, logout, isImpersonating } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import clsx from "clsx";
import ImpersonateMenu from "./ImpersonateMenu";
import AdminSwitchPanel from "./AdminSwitchPanel";
import Breadcrumb from "./Breadcrumb";
import ThemeToggle from "./ThemeToggle";
import QuickSearchDialog from "./QuickSearchDialog";

export interface HeaderProps {
  scrolled: boolean;
  onOpenMobileMenu: () => void;
}

function subscribeStorage(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

export default function Header({ scrolled, onOpenMobileMenu }: HeaderProps) {
  const router = useRouter();
  const user = getUser();
  const [pendingCount, setPendingCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  // Reactive reads from localStorage — no setState-in-effect.
  const impersonating = useSyncExternalStore(
    subscribeStorage,
    () => isImpersonating(),
    () => false,
  );

  useEffect(() => {
    if (!getToken()) return;
    void apiFetch("/auth/me").catch(() => {});
    void apiFetch<{ summary: { total: number; overdue: number } }>("/cases/my-tasks")
      .then((d) => setPendingCount(d.summary.total))
      .catch(() => {});
  }, []);

  // Cmd/Ctrl+K opens QuickSearch
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const initials = user?.fullName
    ? user.fullName.split(" ").slice(0, 2).map((w) => w.charAt(0)).join("")
    : "?";

  return (
    <div className={clsx("top-bar group relative", scrolled && "scrolled")}>
      <div className="flex h-16 items-center gap-3 border-b border-outline-variant/40 transition-all">
        {/* Mobile menu toggle */}
        <button
          onClick={onOpenMobileMenu}
          className="xl:hidden flex items-center justify-center w-9 h-9 rounded-xl border border-outline-variant/60 bg-surface-bright text-on-surface-variant hover:text-primary transition-colors"
          aria-label="เปิดเมนู"
        >
          <MenuIcon size={18} />
        </button>

        {/* Breadcrumb — grows */}
        <Breadcrumb className="hidden xl:flex flex-1 min-w-0" />
        <div className="xl:hidden flex-1" />

        {/* Quick search trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex h-9 items-center gap-3 rounded-full border border-outline-variant/60 bg-surface-bright px-4 text-sm text-on-surface-variant hover:text-primary transition-colors"
          title="ค้นหาอย่างรวดเร็ว (Ctrl+K)"
        >
          <Search size={15} />
          <span className="hidden sm:inline opacity-75">ค้นหา…</span>
          <kbd className="hidden sm:inline-flex h-5 items-center rounded-md border border-outline-variant/60 bg-surface-low px-1.5 text-[10px] font-semibold text-outline">
            ⌘K
          </kbd>
        </button>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Admin tools */}
        <AdminSwitchPanel />
        {user?.roleCode === "ADMIN" && !impersonating && <ImpersonateMenu />}

        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
          title="การแจ้งเตือน"
        >
          <Bell size={18} />
          {pendingCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5"
              style={{
                background: "linear-gradient(135deg, #dc2626, #ef4444)",
                boxShadow: "0 0 6px rgba(220,38,38,0.5)",
              }}
            >
              {pendingCount > 99 ? "99+" : pendingCount}
            </span>
          )}
        </Link>

        {/* Apps grid (placeholder) */}
        <button
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
          title="แอปพลิเคชัน"
        >
          <Grid3x3 size={18} />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-outline-variant/40 mx-1" />

        {/* User area */}
        {user && (
          <div className="flex items-center gap-2">
            <div
              className="relative w-8 h-8 rounded-full flex items-center justify-center cursor-pointer select-none"
              style={{
                background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                boxShadow: "0 0 0 2px rgba(99,102,241,0.3), 0 2px 8px rgba(124,58,237,0.25)",
              }}
              title={user.fullName}
            >
              <span className="text-xs font-bold text-white leading-none">{initials}</span>
            </div>
            <div className="hidden lg:flex flex-col max-w-[120px]">
              <span className="text-xs font-semibold text-on-surface truncate leading-tight">
                {user.fullName}
              </span>
              {user.roleCode && (
                <span className="text-[10px] text-on-surface-variant/80 truncate leading-tight">
                  {roleLabelTH(user.roleCode)}
                </span>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-outline hover:text-error hover:bg-error-container/40 transition-colors"
              title="ออกจากระบบ"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>

      <QuickSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function roleLabelTH(roleCode: string): string {
  const map: Record<string, string> = {
    ADMIN: "ผู้ดูแลระบบ",
    DIRECTOR: "ผู้อำนวยการ",
    VICE_DIRECTOR: "รองผู้อำนวยการ",
    HEAD_TEACHER: "หัวหน้ากลุ่มสาระ",
    TEACHER: "ครู",
    CLERK: "ธุรการ",
  };
  return map[roleCode] ?? roleCode;
}
