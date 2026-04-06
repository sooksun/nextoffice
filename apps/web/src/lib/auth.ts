import { apiFetch } from "./api";

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  roleCode: string;
  organizationId: number | null;
  organizationName: string | null;
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
    document.cookie = `token=${data.token.trim()}; path=/; max-age=${maxAge}; SameSite=Lax`;
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
