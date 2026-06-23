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

function clearLegacyTokenStorage() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("adminToken");
  // Expire any legacy non-httpOnly token cookie from older builds.
  document.cookie = "token=; path=/; max-age=0";
}

function persistUser(user: AuthUser) {
  if (typeof window === "undefined") return;
  clearLegacyTokenStorage();
  localStorage.setItem("user", JSON.stringify(user));
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
    persistUser(data.user);
  }
  return data;
}

export async function loginWithGoogle(
  idToken: string,
): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
  if (typeof window !== "undefined") {
    persistUser(data.user);
  }
  return data;
}

export function logout() {
  if (typeof window !== "undefined") {
    // Best-effort: clear the server-side httpOnly cookie too.
    apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("user");
    localStorage.removeItem("adminUser");
    clearLegacyTokenStorage();
  }
}

export function getToken(): string | null {
  return null;
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
  return !!getUser();
}

// ─── Impersonation ────────────────────────────────────────────────────────────

export function isImpersonating(): boolean {
  if (typeof window === "undefined") return false;
  const user = getUser();
  return !!user?._adminId;
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
  const currentUser = getUser();
  clearLegacyTokenStorage();
  if (currentUser) localStorage.setItem("adminUser", JSON.stringify(currentUser));
  localStorage.setItem("user", JSON.stringify(data.user));
  window.location.assign("/");
}

export async function stopImpersonate(): Promise<void> {
  const data = await apiFetch<{ token: string; user: AuthUser }>("/auth/impersonate", {
    method: "DELETE",
  });
  clearLegacyTokenStorage();
  localStorage.removeItem("adminUser");
  localStorage.setItem("user", JSON.stringify(data.user));
  window.location.assign("/");
}
