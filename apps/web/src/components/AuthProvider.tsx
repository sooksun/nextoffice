"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";
import { isPublicPath } from "@/lib/public-paths";

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
    if (isPublicPath(pathname) || validatedRef.current) {
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
  if (!checked && !isPublicPath(pathname)) {
    return null;
  }

  return <>{children}</>;
}
