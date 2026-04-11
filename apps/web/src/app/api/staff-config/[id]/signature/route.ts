import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/** Proxy: GET /api/staff-config/:id/signature → backend /staff-config/:id/signature */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const internalBase = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";

  const store = await cookies();
  const token = store.get("token")?.value;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${internalBase}/staff-config/${id}/signature`, { headers });
    if (!res.ok) return new NextResponse(null, { status: res.status });

    const contentType = res.headers.get("content-type") ?? "image/png";
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err: unknown) {
    return new NextResponse(`Error: ${(err as Error).message}`, { status: 502 });
  }
}
