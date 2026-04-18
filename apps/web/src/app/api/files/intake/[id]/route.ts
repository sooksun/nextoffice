import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Proxy endpoint: GET /api/files/intake/:id
 * Fetches original file from internal API (http://api:3000/intake/:id/file)
 * and streams it to the browser — avoids cross-origin iframe/img issues.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const internalBase = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";

  // Token from cookie (LIFF in-app) or query param (external browser)
  const store = await cookies();
  const token =
    store.get("token")?.value ??
    request.nextUrl.searchParams.get("token") ??
    undefined;

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const stamped = request.nextUrl.searchParams.get("stamped") === "true";
  const apiPath = stamped
    ? `${internalBase}/stamps/intake/${id}/view`
    : `${internalBase}/intake/${id}/file`;

  try {
    const res = await fetch(apiPath, { headers });

    if (!res.ok) {
      return new NextResponse(`ไม่พบไฟล์ (${res.status})`, { status: res.status });
    }

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const contentDisposition = res.headers.get("content-disposition") ?? "";
    const contentLength = res.headers.get("content-length");

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": stamped ? "private, no-store" : "private, max-age=3600",
    };
    if (contentDisposition) responseHeaders["Content-Disposition"] = contentDisposition;
    if (contentLength) responseHeaders["Content-Length"] = contentLength;

    return new NextResponse(res.body, { status: 200, headers: responseHeaders });
  } catch (err: any) {
    return new NextResponse(`เกิดข้อผิดพลาด: ${err.message}`, { status: 502 });
  }
}
