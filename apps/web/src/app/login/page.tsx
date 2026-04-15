"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, loginWithGoogle } from "@/lib/auth";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import Image from "next/image";
import { useGoogleEnabled } from "./GoogleAuthProvider";

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

  async function handleGoogleSuccess(credentialResponse: any) {
    const idToken = credentialResponse?.credential;
    if (!idToken) return;
    setError("");
    setLoading(true);
    try {
      await loginWithGoogle(idToken);
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("401")
          ? "ไม่พบบัญชีในระบบ กรุณาติดต่อผู้ดูแล"
          : "เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google",
      );
    } finally {
      setLoading(false);
    }
  }

  const googleEnabled = useGoogleEnabled();

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: "#7DCB77" }}>
      {/* Main content — green bg, branding left, card right */}
      <div className="flex flex-1 items-center px-8 md:px-16 lg:px-24 gap-8 py-10">

        {/* Left — branding */}
        <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center gap-5">
          <Image
            src="/nextlogowhite2.png"
            alt="NextOffice Logo"
            width={120}
            height={120}
            className="drop-shadow-lg"
            priority
          />
          <div>
            <h1 className="text-gray-900 text-4xl font-black tracking-widest mt-1">NEXT OFFICE</h1>
            <p className="text-gray-700 text-sm mt-1">ระบบสำนักงานอิเล็กทรอนิกส์ด้วยปัญญาประดิษฐ์</p>
          </div>
          <p className="text-gray-800 font-semibold text-lg leading-snug max-w-sm">
            โรงเรียนบ้านพญาไพร
          </p>
          <p className="text-gray-800 font-semibold text-lg leading-snug max-w-sm">
            สำนักงานเขตพื้นที่การศึกษาประถมศึกษาเชียงราย เขต 3
          </p>
        </div>

        {/* Right — floating white card */}
        <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-[460px] bg-white rounded-2xl shadow-2xl px-10 py-14">
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

          {googleEnabled && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">หรือ</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError("เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google")}
                  text="signin_with"
                  shape="rectangular"
                  width="400"
                />
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-6 py-2 text-xs"
        style={{ backgroundColor: "#1a1a2e", color: "#aaa" }}
      >
        <span>
          {new Date().getFullYear()} &copy;{" "}
          <span className="text-blue-400 font-medium">Solution Nextgen.</span>{" "}
          NextOffice AI E-Office
        </span>
        <span className="hover:text-white cursor-pointer transition-colors">ติดต่อเรา</span>
      </div>
    </div>
  );
}
