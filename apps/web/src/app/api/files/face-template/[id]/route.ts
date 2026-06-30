import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getErrorMessage } from "@/lib/errors";

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

  // Auth via the httpOnly cookie only — never accept the token as a query param
  // (it would leak into server logs, referrers, and browser history).
  const store = await cookies();
  const token = store.get("token")?.value ?? undefined;

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
  } catch (err: unknown) {
    return new NextResponse(`เกิดข้อผิดพลาด: ${getErrorMessage(err)}`, { status: 502 });
  }
}
