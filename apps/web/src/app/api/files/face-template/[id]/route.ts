import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Proxy: GET /api/files/face-template/:id
 * Fetches face template image from backend (MinIO via NestJS auth).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const internalBase = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";

  const store = await cookies();
  const token =
    store.get("token")?.value ??
    request.nextUrl.searchParams.get("token") ??
    undefined;

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(
      `${internalBase}/attendance/admin/enrollments/templates/${id}/image`,
      { headers }
    );

    if (!res.ok) {
      return new NextResponse(`ไม่พบภาพ (${res.status})`, { status: res.status });
    }

    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err: any) {
    return new NextResponse(`เกิดข้อผิดพลาด: ${err.message}`, { status: 502 });
  }
}
