"use client";

import { useEffect, useRef, useState } from "react";
import { UserCog, X, Eye, EyeOff, LogIn, ArrowLeftRight, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  getUser,
  getAdminUser,
  isImpersonating,
  stopImpersonate,
  AuthUser,
} from "@/lib/auth";

interface SwitchResponse {
  token: string;
  user: AuthUser & { _adminId?: number };
}

function applySession(data: SwitchResponse, currentToken: string, currentUser: AuthUser) {
  localStorage.setItem("adminToken", currentToken);
  localStorage.setItem("adminUser", JSON.stringify(currentUser));
  localStorage.setItem("token", data.token.trim());
  localStorage.setItem("user", JSON.stringify(data.user));
  document.cookie = `token=${data.token.trim()}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;
  window.location.assign("/");
}

export default function AdminSwitchPanel() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [adminUser, setAdminUser] = useState<AuthUser | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    // Show panel only for real admin (not while impersonating under a non-admin session)
    const imp = isImpersonating();
    const admin = getAdminUser();
    const isAdmin = imp ? admin?.roleCode === "ADMIN" : u.roleCode === "ADMIN";
    if (!isAdmin) return;
    setVisible(true);
    setCurrentUser(u);
    setAdminUser(admin);
    setImpersonating(imp);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleSwitch(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("adminToken") || localStorage.getItem("token") || "";
      const user = adminUser || currentUser;
      const data = await apiFetch<SwitchResponse>("/auth/switch-user", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      applySession(data, token, user!);
    } catch (err: any) {
      setError(err.message?.replace(/^API \d+: /, "") ?? "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;

  return (
    <div ref={panelRef} className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Panel */}
      {open && (
        <div className="w-80 bg-surface-lowest border border-outline-variant/30 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-outline-variant/20">
            <div className="flex items-center gap-2">
              <UserCog size={16} className="text-primary" />
              <span className="text-sm font-bold text-on-surface">Admin: สลับ User</span>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 text-outline hover:text-on-surface rounded-lg transition-colors">
              <X size={15} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Current session info */}
            <div className="p-3 rounded-xl bg-surface-low border border-outline-variant/20 space-y-1">
              <p className="text-xs text-outline font-medium uppercase tracking-wide">Session ปัจจุบัน</p>
              {impersonating ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <p className="text-sm font-semibold text-on-surface">{currentUser?.fullName}</p>
                    <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-bold">{currentUser?.roleCode}</span>
                  </div>
                  <p className="text-xs text-outline pl-4">Admin จริง: {adminUser?.fullName}</p>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <ShieldCheck size={14} className="text-primary shrink-0" />
                  <p className="text-sm font-semibold text-on-surface">{currentUser?.fullName}</p>
                  <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded font-bold">ADMIN</span>
                </div>
              )}
            </div>

            {/* Stop impersonation */}
            {impersonating && (
              <button
                onClick={stopImpersonate}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-sm transition-colors"
              >
                <ArrowLeftRight size={15} />
                หยุดทดสอบ — กลับสู่ Admin
              </button>
            )}

            {/* Switch form */}
            <form onSubmit={handleSwitch} className="space-y-3">
              <p className="text-xs font-semibold text-on-surface-variant">
                {impersonating ? "สลับไปยัง User อื่น:" : "เข้าสู่ระบบในฐานะ User:"}
              </p>

              <div className="space-y-2">
                <input
                  type="email"
                  placeholder="อีเมลของผู้ใช้"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-surface-low border border-outline-variant/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all text-on-surface placeholder:text-outline/50"
                />
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    placeholder="รหัสผ่านของผู้ใช้"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 pr-9 text-sm bg-surface-low border border-outline-variant/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all text-on-surface placeholder:text-outline/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
                  >
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs text-error bg-error-container/30 px-3 py-2 rounded-lg">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-on-primary rounded-xl font-semibold text-sm transition-colors"
              >
                <LogIn size={15} />
                {loading ? "กำลังสลับ..." : "สลับ User"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg font-semibold text-sm transition-all ${
          impersonating
            ? "bg-amber-500 hover:bg-amber-600 text-white"
            : "bg-primary hover:bg-primary/90 text-on-primary"
        }`}
        title="Admin: สลับ User"
      >
        <UserCog size={16} />
        {impersonating ? `${currentUser?.fullName} (ทดสอบ)` : "สลับ User"}
      </button>
    </div>
  );
}
