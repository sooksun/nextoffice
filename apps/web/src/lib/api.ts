// Server-side (Docker): use internal network URL; Client-side: use public URL
const API_BASE =
  typeof window === "undefined"
    ? (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "")
    : (process.env.NEXT_PUBLIC_API_URL ?? "");

function clearClientAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUser");
  // Expire any legacy non-httpOnly token cookie from older builds.
  document.cookie = "token=; path=/; max-age=0";
}

export function getAuthToken(): string | null {
  return null;
}

/** Read JWT from cookie — used by server components where localStorage is unavailable */
export async function getServerToken(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get("token")?.value ?? null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const serverToken = typeof window === "undefined" ? await getServerToken() : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    // Browser requests authenticate with the httpOnly cookie. Server requests
    // forward that cookie as Bearer because they run outside the browser jar.
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(serverToken ? { Authorization: `Bearer ${serverToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    // 401 + เคยส่ง Bearer = โทเค็นหมดอายุ / JWT_SECRET เปลี่ยน / โทเค็นเสีย
    if (res.status === 401) {
      clearClientAuth();
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        window.location.assign("/login?session=expired");
        // ไม่ throw ต่อ — กำลังไปหน้า login อยู่
        return new Promise(() => {}) as Promise<T>;
      }
    }
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
