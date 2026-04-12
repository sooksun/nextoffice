import { apiFetch } from "./api";

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  roleCode: string;
  organizationId: number | null;
  organizationName: string | null;
  organizationPhone: string | null;
  organizationEmail: string | null;
  // เขตพื้นที่การศึกษา
  educationArea: string | null;       // areaCode เช่น "สพป.เชียงราย เขต 3"
  educationAreaId: number | null;
  educationAreaName: string | null;   // ชื่อเต็มของ org ระดับเขต
  // ปีสารบรรณที่ใช้งาน
  activeAcademicYear: { id: number; year: number; name: string } | null;
  _adminId?: number;
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (typeof window !== "undefined") {
    localStorage.setItem("token", data.token.trim());
    localStorage.setItem("user", JSON.stringify(data.user));
    // Also set cookie so server-side components can read JWT
    const maxAge = 7 * 24 * 3600;
    document.cookie = `token=${data.token.trim()}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`;
  }
  return data;
}

export function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    document.cookie = "token=; path=/; max-age=0";
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// ─── Impersonation ────────────────────────────────────────────────────────────

export function isImpersonating(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("adminToken");
}

export function getAdminUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("adminUser");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function impersonate(targetUserId: number): Promise<void> {
  const data = await apiFetch<{ token: string; user: AuthUser }>(
    `/auth/impersonate/${targetUserId}`,
    { method: "POST" },
  );
  // Preserve current admin session
  const currentToken = getToken();
  const currentUser = getUser();
  localStorage.setItem("adminToken", currentToken!);
  localStorage.setItem("adminUser", JSON.stringify(currentUser));
  // Activate impersonation token
  const maxAge = 7 * 24 * 3600;
  localStorage.setItem("token", data.token.trim());
  localStorage.setItem("user", JSON.stringify(data.user));
  document.cookie = `token=${data.token.trim()}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`;
  window.location.assign("/");
}

export function stopImpersonate(): void {
  const adminToken = localStorage.getItem("adminToken");
  const adminUser = localStorage.getItem("adminUser");
  if (adminToken) {
    const maxAge = 7 * 24 * 3600;
    localStorage.setItem("token", adminToken);
    if (adminUser) localStorage.setItem("user", adminUser);
    document.cookie = `token=${adminToken}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`;
  }
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUser");
  window.location.assign("/");
}
