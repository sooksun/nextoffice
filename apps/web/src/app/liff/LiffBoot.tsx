"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type LiffStatus = "initializing" | "need-login" | "pairing-required" | "ready" | "error";

interface LiffCtxValue {
  status: LiffStatus;
  error: string | null;
  displayName: string | null;
  pictureUrl: string | null;
}

const LiffCtx = createContext<LiffCtxValue>({
  status: "initializing",
  error: null,
  displayName: null,
  pictureUrl: null,
});

export const useLiff = () => useContext(LiffCtx);

interface Props {
  liffId: string;
  children: React.ReactNode;
}

/**
 * Boot sequence:
 *  1. Load @line/liff lazily (client-only)
 *  2. liff.init({ liffId })
 *  3. If not logged in → liff.login() (will redirect to LINE, returns here)
 *  4. Grab profile + access token → POST /line-auth/verify → store JWT + user
 *  5. Mark status=ready; children can call apiFetch normally
 *
 * On mobile LINE app, liff.isLoggedIn() is usually true immediately (LINE session).
 * On browsers outside LINE, liff.login() redirects to LINE OAuth page.
 */
export default function LiffBoot({ liffId, children }: Props) {
  const [status, setStatus] = useState<LiffStatus>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!liffId) {
      setStatus("error");
      setError("ยังไม่ได้ตั้งค่า LIFF_ID บน server");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const liffModule = await import("@line/liff");
        const liff = liffModule.default;
        await liff.init({ liffId });
        if (cancelled) return;

        if (!liff.isLoggedIn()) {
          setStatus("need-login");
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const accessToken = liff.getAccessToken();
        if (!accessToken) {
          throw new Error("ไม่สามารถดึง LINE access token ได้");
        }

        setDisplayName(profile.displayName);
        setPictureUrl(profile.pictureUrl ?? null);

        // Exchange for system JWT
        try {
          const resp = await apiFetch<{ token: string; user: any }>("/line-auth/verify", {
            method: "POST",
            body: JSON.stringify({ accessToken }),
          });
          if (cancelled) return;
          localStorage.setItem("token", resp.token);
          localStorage.setItem("user", JSON.stringify(resp.user));
          document.cookie = `token=${resp.token}; path=/; max-age=${60 * 60 * 24 * 7}`;
          setStatus("ready");
        } catch (err: any) {
          const msg = String(err?.message ?? "");
          if (msg.includes("401")) {
            setStatus("pairing-required");
          } else {
            setStatus("error");
            setError(msg || "เชื่อมระบบไม่สำเร็จ");
          }
        }
      } catch (err: any) {
        if (cancelled) return;
        setStatus("error");
        setError(err?.message ?? "LIFF init ล้มเหลว");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [liffId]);

  return (
    <LiffCtx.Provider value={{ status, error, displayName, pictureUrl }}>
      <div className="min-h-screen bg-slate-50">
        {status === "ready" ? (
          children
        ) : (
          <LiffStatusScreen status={status} error={error} />
        )}
      </div>
    </LiffCtx.Provider>
  );
}

function LiffStatusScreen({ status, error }: { status: LiffStatus; error: string | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      {status === "initializing" && (
        <>
          <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-green-500" />
          <p className="text-sm text-slate-600">กำลังเชื่อมต่อ LINE…</p>
        </>
      )}
      {status === "need-login" && (
        <p className="text-sm text-slate-600">กำลังไปยังหน้าเข้าสู่ระบบ LINE…</p>
      )}
      {status === "pairing-required" && (
        <>
          <div className="mb-3 text-3xl">⚠️</div>
          <h2 className="mb-2 text-lg font-semibold">ยังไม่ได้เชื่อมบัญชี</h2>
          <p className="max-w-sm text-sm text-slate-600">
            บัญชี LINE นี้ยังไม่ได้ผูกกับระบบ NextOffice
            <br />
            กรุณาทักแชทบอทและผูกบัญชีด้วยอีเมลก่อนใช้งาน MINI App
          </p>
        </>
      )}
      {status === "error" && (
        <>
          <div className="mb-3 text-3xl">❌</div>
          <h2 className="mb-2 text-lg font-semibold">เกิดข้อผิดพลาด</h2>
          <p className="max-w-sm text-sm text-rose-600">{error}</p>
        </>
      )}
    </div>
  );
}
