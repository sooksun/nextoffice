"use client";

import { useEffect, useState } from "react";
import { Search, Bell, Grid3x3, LogOut, Sparkles } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { getUser, getToken, logout, isImpersonating } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import ImpersonateMenu from "./ImpersonateMenu";

const NAV_TABS = [
  { label: "ภาพรวม", href: "/" },
  { label: "เอกสารขาเข้า", href: "/intakes" },
  { label: "คลังเอกสาร", href: "/documents" },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();
  const [pendingCount, setPendingCount] = useState(0);
  const [impersonating, setImpersonating] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    setImpersonating(isImpersonating());
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    void apiFetch("/auth/me").catch(() => {});
    void apiFetch<{ summary: { total: number; overdue: number } }>("/cases/my-tasks")
      .then((d) => setPendingCount(d.summary.total))
      .catch(() => {});
  }, []);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .slice(0, 2)
        .map((w: string) => w.charAt(0))
        .join("")
    : "?";

  return (
    <header className="shrink-0 h-14 px-4 lg:px-6 flex items-center justify-between z-40 relative"
      style={{
        background: "rgba(255,255,255,0.82)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(196,190,237,0.25)",
      }}
    >
      {/* Gradient accent line at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1.5px] pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent 0%, #6366f1 20%, #8b5cf6 50%, #a855f7 80%, transparent 100%)",
          opacity: 0.45,
        }}
      />

      {/* Left: Search + Nav */}
      <div className="flex items-center gap-6">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
            style={{ color: searchFocused ? "#7c3aed" : "#6b63a8" }}
          />
          <input
            type="text"
            placeholder="ค้นหาเอกสาร..."
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="w-60 pl-9 pr-4 py-1.5 rounded-full text-sm text-on-surface placeholder:text-outline/50 outline-none transition-all duration-200"
            style={{
              background: searchFocused
                ? "rgba(99,102,241,0.06)"
                : "rgba(237,233,254,0.55)",
              border: searchFocused
                ? "1.5px solid rgba(124,58,237,0.45)"
                : "1.5px solid rgba(196,190,237,0.35)",
              boxShadow: searchFocused
                ? "0 0 0 3px rgba(124,58,237,0.10)"
                : "none",
            }}
          />
        </div>

        {/* Nav tabs */}
        <nav className="hidden lg:flex items-center gap-1 text-sm">
          {NAV_TABS.map((tab) => {
            const isActive =
              pathname === tab.href ||
              (tab.href !== "/" && pathname.startsWith(tab.href));
            return (
              <a
                key={tab.href}
                href={tab.href}
                className="relative px-3 py-1.5 rounded-lg font-medium transition-all duration-200"
                style={{
                  color: isActive ? "#4f46e5" : "#4c4675",
                  background: isActive ? "rgba(99,102,241,0.08)" : "transparent",
                }}
              >
                {tab.label}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full"
                    style={{
                      background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
                    }}
                  />
                )}
              </a>
            );
          })}
        </nav>
      </div>

      {/* Right: Actions + User */}
      <div className="flex items-center gap-1.5">
        {user?.roleCode === "ADMIN" && !impersonating && <ImpersonateMenu />}

        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative p-2 rounded-xl transition-all duration-200 hover:bg-primary/8 group"
          title="การแจ้งเตือนงาน"
        >
          <Bell
            size={18}
            className="text-on-surface-variant group-hover:text-primary transition-colors"
          />
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

        {/* Apps grid */}
        <button
          className="p-2 rounded-xl transition-all duration-200 hover:bg-primary/8 group"
          title="แอปพลิเคชัน"
        >
          <Grid3x3
            size={18}
            className="text-on-surface-variant group-hover:text-primary transition-colors"
          />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-outline-variant/30 mx-1" />

        {/* User area */}
        {user && (
          <div className="flex items-center gap-2">
            {/* Avatar */}
            <div
              className="relative w-8 h-8 rounded-full flex items-center justify-center cursor-pointer select-none"
              style={{
                background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                boxShadow: "0 0 0 2px rgba(99,102,241,0.3), 0 2px 8px rgba(124,58,237,0.25)",
              }}
              title={user.fullName}
            >
              <span className="text-xs font-bold text-white leading-none">
                {initials}
              </span>
            </div>

            {/* Name */}
            <div className="hidden lg:flex flex-col max-w-[110px]">
              <span className="text-xs font-semibold text-on-surface truncate leading-tight">
                {user.fullName}
              </span>
              {user.roleCode && (
                <span className="text-[10px] text-on-surface-variant/70 truncate leading-tight">
                  {roleLabelTH(user.roleCode)}
                </span>
              )}
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error-container/60 transition-all duration-200"
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
