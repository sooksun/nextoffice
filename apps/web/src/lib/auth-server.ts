import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Server-side role guard — call at top of a Server Component layout.
 * Fetches /auth/me with the current token and redirects if role not allowed.
 *
 * Usage:
 *   await requireRole(["ADMIN"]);
 *   await requireRole(["ADMIN", "DIRECTOR"]);
 */
export async function requireRole(allowedRoles: string[]): Promise<void> {
  const store = await cookies();
  const token = store.get("token")?.value;

  if (!token) {
    redirect("/login");
  }

  const apiUrl =
    process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";

  try {
    const res = await fetch(`${apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      redirect("/login");
    }

    const user = await res.json();
    const role: string = user?.roleCode ?? "";

    if (!allowedRoles.includes(role)) {
      // Redirect unauthorized users back to dashboard
      redirect("/");
    }
  } catch {
    redirect("/login");
  }
}
