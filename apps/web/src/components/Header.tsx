"use client";

import { Search, Bell, Grid3x3, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { getUser, logout } from "@/lib/auth";

const NAV_TABS = [
  { label: "ภาพรวม", href: "/" },
  { label: "เอกสารขาเข้า", href: "/intakes" },
  { label: "คลังเอกสาร", href: "/documents" },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <header className="shrink-0 h-14 px-6 flex items-center justify-between bg-surface-lowest border-b border-outline-variant/20 shadow-sm z-40">
      {/* Left: Search + Nav */}
      <div className="flex items-center gap-8">
        <div className="relative hidden md:block">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-outline"
          />
          <input
            type="text"
            placeholder="ค้นหาเอกสาร..."
            className="w-64 pl-9 pr-4 py-1.5 bg-surface-low border border-outline-variant/20 rounded-full text-sm text-on-surface placeholder:text-outline/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
          />
        </div>
        <nav className="hidden lg:flex items-center gap-5 font-[family-name:var(--font-be-vietnam-pro)] text-sm tracking-tight">
          {NAV_TABS.map((tab) => {
            const isActive =
              pathname === tab.href ||
              (tab.href !== "/" && pathname.startsWith(tab.href));
            return (
              <a
                key={tab.href}
                href={tab.href}
                className={
                  isActive
                    ? "text-primary font-bold border-b-2 border-primary pb-0.5"
                    : "text-on-surface-variant hover:text-secondary transition-colors"
                }
              >
                {tab.label}
              </a>
            );
          })}
        </nav>
      </div>

      {/* Right: Actions + User */}
      <div className="flex items-center gap-2">
        <button className="p-2 text-on-surface-variant hover:bg-surface-high rounded-full transition-colors relative">
          <Bell size={18} />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-error rounded-full ring-2 ring-surface-lowest" />
        </button>
        <button className="p-2 text-on-surface-variant hover:bg-surface-high rounded-full transition-colors">
          <Grid3x3 size={18} />
        </button>
        <div className="w-px h-5 bg-outline-variant/20 mx-1" />
        {user && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 border-2 border-primary-fixed flex items-center justify-center cursor-pointer">
              <span className="text-xs font-bold text-primary">
                {user.fullName.charAt(0)}
              </span>
            </div>
            <span className="text-xs font-medium text-on-surface-variant hidden lg:inline max-w-[120px] truncate">
              {user.fullName}
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 text-outline hover:text-error hover:bg-error-container rounded-lg transition-colors"
              title="ออกจากระบบ"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
