"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";
import { LogIn, Eye, EyeOff, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("session") === "expired") {
      setSessionExpired(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.includes("401")
            ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
            : "เกิดข้อผิดพลาดในการเชื่อมต่อ"
          : "เกิดข้อผิดพลาด",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-primary font-headline tracking-tight">
            Next Office
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            ระบบสารบรรณอิเล็กทรอนิกส์อัจฉริยะ
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-lowest rounded-3xl border border-outline-variant/10 shadow-xl p-8">
          <h2 className="text-xl font-bold text-primary font-headline mb-6">
            เข้าสู่ระบบ
          </h2>

          {sessionExpired && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-secondary-container/40 text-on-secondary-container rounded-2xl text-sm font-medium border border-secondary/20">
              <AlertCircle size={16} />
              เซสชันหมดอายุหรือโทเค็นไม่ตรงกับเซิร์ฟเวอร์ (เช่น แก้ JWT_SECRET หรือ JWT_EXPIRES_IN
              หลังล็อกอิน) กรุณาเข้าสู่ระบบอีกครั้ง
            </div>
          )}
          {error && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-error-container text-on-error-container rounded-2xl text-sm font-medium">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-outline uppercase tracking-wider mb-2">
                อีเมล
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="example@school.go.th"
                className="w-full px-4 py-3 bg-surface-low border border-outline-variant/20 rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/30 outline-none transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-outline uppercase tracking-wider mb-2">
                รหัสผ่าน
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-surface-low border border-outline-variant/20 rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/30 outline-none transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-primary text-on-primary rounded-2xl font-bold text-sm transition-all active:scale-[0.98] hover:brightness-110 flex items-center justify-center gap-2 shadow-md shadow-primary/20 disabled:opacity-60"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={16} />
                  เข้าสู่ระบบ
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-outline mt-6">
          NextOffice AI E-Office &copy; {new Date().getFullYear()} — Education AI
        </p>
      </div>
    </div>
  );
}
