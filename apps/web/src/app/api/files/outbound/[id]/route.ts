import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Proxy endpoint: GET /api/files/outbound/:id
 * Fetches generated PDF from internal API (/outbound/documents/:id/pdf)
 * and streams it to the browser with JWT from cookie.
 * Needed so LIFF <iframe> previews work (can't attach custom auth header).
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

  const apiPath = `${internalBase}/outbound/documents/${id}/pdf`;

  try {
    const res = await fetch(apiPath, { headers });

    if (!res.ok) {
      return new NextResponse(`ไม่พบไฟล์ (${res.status})`, { status: res.status });
    }

    const contentType = res.headers.get("content-type") ?? "application/pdf";
    const contentLength = res.headers.get("content-length");

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
    };
    if (contentLength) responseHeaders["Content-Length"] = contentLength;

    return new NextResponse(res.body, { status: 200, headers: responseHeaders });
  } catch (err: any) {
    return new NextResponse(`เกิดข้อผิดพลาด: ${err.message}`, { status: 502 });
  }
}
