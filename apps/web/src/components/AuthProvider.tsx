"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";

// /liff is excluded because LiffBoot handles its own auth flow (LINE token → JWT)
const PUBLIC_PATHS = ["/login", "/privacy", "/terms", "/liff"];

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  // Validate the session cookie via /auth/me once per mount, not on every
  // client-side navigation. Stale sessions are still caught by apiFetch's 401
  // handler on the page's own data calls.
  const validatedRef = useRef(false);

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
    if (isPublic || validatedRef.current) {
      startTransition(() => setChecked(true));
      return;
    }

    let cancelled = false;
    apiFetch<AuthUser>("/auth/me")
      .then((user) => {
        if (cancelled) return;
        validatedRef.current = true;
        localStorage.removeItem("token");
        localStorage.setItem("user", JSON.stringify(user));
        startTransition(() => setChecked(true));
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  // Show nothing while checking auth on protected routes
  if (!checked && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return null;
  }

  return <>{children}</>;
}
