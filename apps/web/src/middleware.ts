import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { INFRA_PREFIXES, isPublicPath } from "@/lib/public-paths";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths through without auth check
  if (INFRA_PREFIXES.some((p) => pathname.startsWith(p)) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get("token")?.value;
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
};
