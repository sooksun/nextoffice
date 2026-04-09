"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

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
            ? "ชื่อล็อกอิน/อีเมล หรือรหัสผ่านไม่ถูกต้อง"
            : "เกิดข้อผิดพลาดในการเชื่อมต่อ"
          : "เกิดข้อผิดพลาด",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: "#7DCB77" }}>
      {/* Main content — green bg, branding left, card right */}
      <div className="flex flex-1 items-center px-8 md:px-16 lg:px-24 gap-8 py-10">

        {/* Left — branding */}
        <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center gap-5">
          <div className="w-28 h-28 rounded-full border-4 border-white/40 flex items-center justify-center shadow-lg"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
            <svg className="w-16 h-16 text-white/80" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
            </svg>
          </div>
          <div>
            <p className="text-gray-800 text-xl font-semibold">สพป.เชียงราย เขต 3</p>
            <h1 className="text-gray-900 text-4xl font-black tracking-widest mt-1">SMART OFFICE</h1>
            <p className="text-gray-700 text-sm mt-1">ระบบสำนักงานอิเล็กทรอนิกส์</p>
          </div>
          <p className="text-gray-800 font-semibold text-lg leading-snug max-w-sm">
            สำนักงานเขตพื้นที่การศึกษาประถมศึกษาเชียงราย เขต 3
          </p>
        </div>

        {/* Right — floating white card */}
        <div className="w-full md:w-[420px] lg:w-[460px] bg-white rounded-2xl shadow-2xl px-10 py-14 shrink-0">
          <h2 className="text-xl font-bold text-gray-800 text-center mb-8">
            ล็อกอินเข้าใช้งานระบบ
          </h2>

          {sessionExpired && (
            <div className="mb-4 flex items-start gap-2 px-4 py-3 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-200">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง
            </div>
          )}
          {error && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              placeholder="ชื่อล็อกอิน หรือ อีเมล"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 bg-white"
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="current-password"
                placeholder="รหัสผ่าน"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 bg-white pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-lg font-semibold text-white text-sm transition-all hover:brightness-105 active:scale-[0.99] flex items-center justify-center disabled:opacity-60"
              style={{ backgroundColor: "#1B90EF" }}
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "เข้าสู่ระบบ"
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-6 py-2 text-xs"
        style={{ backgroundColor: "#1a1a2e", color: "#aaa" }}
      >
        <span>
          {new Date().getFullYear()} &copy;{" "}
          <span className="text-blue-400 font-medium">CVP Technology System.</span>{" "}
          NextOffice AI E-Office
        </span>
        <span className="hover:text-white cursor-pointer transition-colors">ติดต่อเรา</span>
      </div>
    </div>
  );
}
