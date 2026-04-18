"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, Settings, LogOut, ShieldCheck, BookOpen, ChevronDown } from "lucide-react";
import { logout, type AuthUser } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

function subscribeStorage(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
// Return the RAW localStorage string — stable identity per content — so
// useSyncExternalStore doesn't trigger an infinite render loop (React #185).
function getUserJson(): string {
  try {
    return localStorage.getItem("user") ?? "";
  } catch {
    return "";
  }
}

const ROLE_LABEL_TH: Record<string, string> = {
  ADMIN: "ผู้ดูแลระบบ",
  DIRECTOR: "ผู้อำนวยการ",
  VICE_DIRECTOR: "รองผู้อำนวยการ",
  HEAD_TEACHER: "หัวหน้ากลุ่มสาระ",
  TEACHER: "ครู",
  CLERK: "ธุรการ",
};

/**
 * Avatar + dropdown with user info header, profile / settings / logout.
 */
export default function AccountDropdown() {
  const router = useRouter();
  const userJson = useSyncExternalStore(subscribeStorage, getUserJson, () => "");
  const user = useMemo<AuthUser | null>(() => {
    if (!userJson) return null;
    try {
      return JSON.parse(userJson) as AuthUser;
    } catch {
      return null;
    }
  }, [userJson]);

  if (!user) return null;

  const initials = user.fullName
    ? user.fullName.split(" ").slice(0, 2).map((w) => w.charAt(0)).join("")
    : "?";

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-xl p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
          title={user.fullName}
        >
          <div
            className="relative w-8 h-8 rounded-full flex items-center justify-center select-none"
            style={{
              background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
              boxShadow: "0 0 0 2px rgba(99,102,241,0.3), 0 2px 8px rgba(124,58,237,0.25)",
            }}
          >
            <span className="text-xs font-bold text-white leading-none">{initials}</span>
          </div>
          <div className="hidden lg:flex flex-col items-start max-w-[120px]">
            <span className="text-xs font-semibold text-on-surface truncate leading-tight">
              {user.fullName}
            </span>
            {user.roleCode && (
              <span className="text-[10px] text-on-surface-variant/80 truncate leading-tight">
                {ROLE_LABEL_TH[user.roleCode] ?? user.roleCode}
              </span>
            )}
          </div>
          <ChevronDown size={12} className="hidden lg:block text-on-surface-variant/60" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 p-0">
        {/* User info header */}
        <div className="px-4 py-3 bg-primary/5 border-b border-outline-variant/40">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                boxShadow: "0 2px 8px rgba(124,58,237,0.25)",
              }}
            >
              <span className="text-sm font-bold text-white">{initials}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-on-surface truncate">{user.fullName}</p>
              <p className="text-xs text-on-surface-variant truncate">{user.email}</p>
            </div>
          </div>
          {(user.organizationName || user.roleCode) && (
            <div className="flex items-center gap-2 mt-2 text-[11px] text-on-surface-variant">
              {user.roleCode && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">
                  <ShieldCheck size={10} />
                  {ROLE_LABEL_TH[user.roleCode] ?? user.roleCode}
                </span>
              )}
              {user.organizationName && (
                <span className="truncate">{user.organizationName}</span>
              )}
            </div>
          )}
        </div>

        {/* Menu body */}
        <div className="p-1">
          <DropdownMenuLabel>บัญชี</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href="/settings/staff">
              <User className="size-4" />
              โปรไฟล์
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/help">
              <BookOpen className="size-4" />
              ศูนย์ช่วยเหลือ
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuLabel>การตั้งค่า</DropdownMenuLabel>
          {user.roleCode === "ADMIN" && (
            <DropdownMenuItem asChild>
              <Link href="/settings/prompts">
                <Settings className="size-4" />
                ตั้งค่า AI Prompts
              </Link>
            </DropdownMenuItem>
          )}
          {(user.roleCode === "ADMIN" || user.roleCode === "DIRECTOR") && (
            <DropdownMenuItem asChild>
              <Link href="/settings/line-accounts">
                <Settings className="size-4" />
                เชื่อมต่อ LINE
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href="/settings/email">
              <Settings className="size-4" />
              อีเมลสารบรรณ
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleLogout}
            className="text-error focus:text-error focus:bg-error/10"
          >
            <LogOut className="size-4" />
            ออกจากระบบ
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
