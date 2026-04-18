import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Proxy endpoint: GET /api/files/signature/:userId
 * Streams the user's signature image from internal API with JWT from cookie.
 * Used by LIFF signature preview (iframe/img can't attach custom auth header).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const internalBase = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";

  const store = await cookies();
  const token = store.get("token")?.value;

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${internalBase}/staff-config/${id}/signature`, { headers });
    if (!res.ok) {
      return new NextResponse(`ไม่พบลายเซ็น (${res.status})`, { status: res.status });
    }
    const contentType = res.headers.get("content-type") ?? "image/png";
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: any) {
    return new NextResponse(`เกิดข้อผิดพลาด: ${err.message}`, { status: 502 });
  }
}
