const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function clearClientAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("token");
  const t = raw?.trim();
  return t || null;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    // 401 + เคยส่ง Bearer = โทเค็นหมดอายุ / JWT_SECRET เปลี่ยน / โทเค็นเสีย
    if (res.status === 401 && token) {
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
