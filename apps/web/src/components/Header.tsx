"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Search, Menu as MenuIcon, Grid3x3 } from "lucide-react";
import { getUser, getToken, isImpersonating } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import clsx from "clsx";
import ImpersonateMenu from "./ImpersonateMenu";
import AdminSwitchPanel from "./AdminSwitchPanel";
import Breadcrumb from "./Breadcrumb";
import ThemeToggle from "./ThemeToggle";
import ColorSchemePicker from "./ColorSchemePicker";
import QuickSearchDialog from "./QuickSearchDialog";
import NotificationDropdown from "./NotificationDropdown";
import AccountDropdown from "./AccountDropdown";

export interface HeaderProps {
  scrolled: boolean;
  onOpenMobileMenu: () => void;
}

function subscribeStorage(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

export default function Header({ scrolled, onOpenMobileMenu }: HeaderProps) {
  const user = getUser();
  const [searchOpen, setSearchOpen] = useState(false);

  const impersonating = useSyncExternalStore(
    subscribeStorage,
    () => isImpersonating(),
    () => false,
  );

  useEffect(() => {
    if (!getToken()) return;
    void apiFetch("/auth/me").catch(() => {});
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

        {/* Color scheme + theme toggle */}
        <ColorSchemePicker />
        <ThemeToggle />

        {/* Admin tools */}
        <AdminSwitchPanel />
        {user?.roleCode === "ADMIN" && !impersonating && <ImpersonateMenu />}

        {/* Notifications dropdown */}
        <NotificationDropdown />

        {/* Apps grid (placeholder) */}
        <button
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
          title="แอปพลิเคชัน"
        >
          <Grid3x3 size={18} />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-outline-variant/40 mx-1" />

        {/* Account dropdown */}
        <AccountDropdown />
      </div>

      <QuickSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
