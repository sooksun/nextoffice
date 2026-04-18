"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login, loginWithGoogle } from "@/lib/auth";
import { AlertCircle, Eye, EyeOff, Sparkles } from "lucide-react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import Image from "next/image";
import { useGoogleEnabled } from "./GoogleAuthProvider";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get("session") === "expired";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

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

  async function handleGoogleSuccess(credentialResponse: CredentialResponse) {
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

  const inputStyle = (focused: boolean) => ({
    width: "100%",
    padding: "12px 16px",
    borderRadius: "12px",
    fontSize: "14px",
    outline: "none",
    transition: "all 0.2s",
    background: focused ? "rgba(99,102,241,0.04)" : "rgba(248,247,255,0.8)",
    border: focused
      ? "1.5px solid rgba(124,58,237,0.55)"
      : "1.5px solid rgba(196,190,237,0.5)",
    boxShadow: focused ? "0 0 0 3px rgba(124,58,237,0.12)" : "none",
    color: "#1e1b2e",
  });

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{
        background: "linear-gradient(135deg, #1e1b4b 0%, #3730a3 30%, #4f46e5 60%, #7c3aed 100%)",
      }}
    >
      {/* Background decorative orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{
            width: 500, height: 500,
            top: "-120px", left: "-100px",
            background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 400, height: 400,
            bottom: "-80px", right: "10%",
            background: "radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 300, height: 300,
            top: "40%", left: "30%",
            background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative flex flex-1 items-center px-6 md:px-16 lg:px-24 gap-8 py-10">
        {/* Left — branding */}
        <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center gap-6">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full blur-2xl"
              style={{ background: "rgba(165,180,252,0.3)", transform: "scale(1.5)" }}
            />
            <Image
              src="/nextlogowhite2.png"
              alt="NextOffice Logo"
              width={110}
              height={110}
              className="relative drop-shadow-2xl"
              priority
            />
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-indigo-200" />
              <h1
                className="text-4xl font-black tracking-widest"
                style={{
                  background: "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 50%, #f3e8ff 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                NEXT OFFICE
              </h1>
              <Sparkles size={18} className="text-purple-200" />
            </div>
            <p className="text-indigo-200/80 text-sm">ระบบสำนักงานอิเล็กทรอนิกส์ด้วยปัญญาประดิษฐ์</p>
          </div>
          <div
            className="rounded-2xl px-8 py-5 text-center"
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <p className="text-white font-semibold text-lg leading-snug">
              โรงเรียนบ้านพญาไพร
            </p>
            <p className="text-indigo-200/80 text-sm mt-1 leading-snug">
              สำนักงานเขตพื้นที่การศึกษาประถมศึกษาเชียงราย เขต 3
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {["AI อัจฉริยะ", "ปลอดภัย", "ใช้งานง่าย"].map((tag) => (
              <span
                key={tag}
                className="text-xs px-3 py-1 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "rgba(224,231,255,0.9)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Right — login card */}
        <div className="flex-1 flex items-center justify-center">
          <div
            className="w-full max-w-[440px] rounded-3xl px-10 py-12"
            style={{
              background: "rgba(255,255,255,0.95)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 25px 60px rgba(79,70,229,0.25), 0 8px 20px rgba(0,0,0,0.15)",
            }}
          >
            <div className="text-center mb-8">
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
                style={{
                  background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                  boxShadow: "0 4px 16px rgba(124,58,237,0.4)",
                }}
              >
                <Sparkles size={22} className="text-white" />
              </div>
              <h2 className="text-xl font-bold" style={{ color: "#1e1b2e" }}>ล็อกอินเข้าใช้งานระบบ</h2>
              <p className="text-sm" style={{ color: "#4c4675" }}>NextOffice AI E-Office</p>
            </div>

            {sessionExpired && (
              <div
                className="mb-4 flex items-start gap-2 px-4 py-3 rounded-xl text-sm"
                style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", color: "#92400e" }}
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง
              </div>
            )}
            {error && (
              <div
                className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "#991b1b" }}
              >
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                placeholder="ชื่อล็อกอิน หรือ อีเมล"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                style={inputStyle(emailFocused)}
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
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                  style={{ ...inputStyle(passFocused), paddingRight: "44px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: passFocused ? "#7c3aed" : "#6b63a8" }}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all active:scale-[0.99] flex items-center justify-center disabled:opacity-60"
                style={{
                  background: loading
                    ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                    : "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                  boxShadow: "0 4px 16px rgba(124,58,237,0.4)",
                  marginTop: "8px",
                }}
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
                  <div className="flex-1 h-px" style={{ background: "rgba(196,190,237,0.5)" }} />
                  <span className="text-xs" style={{ color: "#4c4675" }}>หรือ</span>
                  <div className="flex-1 h-px" style={{ background: "rgba(196,190,237,0.5)" }} />
                </div>
                <div className="flex justify-center">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError("เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google")}
                    text="signin_with"
                    shape="rectangular"
                    width="360"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="relative flex items-center justify-between px-6 py-2.5 text-xs"
        style={{
          background: "rgba(0,0,0,0.25)",
          backdropFilter: "blur(8px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(196,190,237,0.7)",
        }}
      >
        <span>
          {new Date().getFullYear()} &copy;{" "}
          <span style={{ color: "#a5b4fc", fontWeight: 600 }}>Solution Nextgen.</span>{" "}
          NextOffice AI E-Office
        </span>
        <a href="#" className="transition-colors hover:text-white" style={{ color: "rgba(196,190,237,0.7)" }}>
          ติดต่อเรา
        </a>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#1e1b4b" }}>
          <span className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
