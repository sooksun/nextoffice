import { NextRequest, NextResponse } from "next/server";

/**
 * General API proxy: /api/proxy/:path* → INTERNAL_API_URL/:path*
 *
 * Solves CSP issue: browser calls /api/proxy/... (same-origin HTTPS),
 * this route forwards to http://api:3000/... (Docker-internal HTTP).
 * INTERNAL_API_URL is read at runtime — no rebuild needed when it changes.
 */

const BACKEND = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://api:3000";

const PASSTHROUGH_HEADERS = ["authorization", "content-type", "accept", "x-requested-with"];

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const targetPath = path.join("/");
  const search = req.nextUrl.search;
  const url = `${BACKEND}/${targetPath}${search}`;

  const forwardHeaders: Record<string, string> = {};
  for (const key of PASSTHROUGH_HEADERS) {
    const val = req.headers.get(key);
    if (val) forwardHeaders[key] = val;
  }

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: forwardHeaders,
      body: body && body.byteLength > 0 ? body : undefined,
    });

    const resBody = await upstream.arrayBuffer();
    return new NextResponse(resBody, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "proxy_error", message: err.message },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
