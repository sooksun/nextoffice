/**
 * Routes reachable without a session cookie.
 *
 * Single source of truth for both guards — `middleware.ts` (server, runs first)
 * and `AuthProvider` (client). They previously kept separate lists and drifted:
 * middleware bounced /liff and /track to /login before either could run its own
 * auth flow.
 *
 * - /liff   — LiffBoot exchanges the LINE token for a JWT itself
 * - /track  — public QR lookup, backed by GET /tracking/public/:code (no auth)
 */
export const PUBLIC_PATHS = ["/login", "/privacy", "/terms", "/liff", "/track"];

/** Framework/asset prefixes that must never hit the auth check. */
export const INFRA_PREFIXES = ["/api/", "/_next/", "/favicon"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
