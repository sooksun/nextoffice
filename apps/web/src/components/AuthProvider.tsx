"use client";

import { startTransition, useEffect, useState } from "react";
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

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
    if (isPublic) {
      startTransition(() => setChecked(true));
      return;
    }

    let cancelled = false;
    apiFetch<AuthUser>("/auth/me")
      .then((user) => {
        if (cancelled) return;
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
