import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { Clock, Camera, CalendarDays, BarChart3, UserCheck } from "lucide-react";

export const dynamic = "force-dynamic";

interface TodayStatus {
  date: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  geofenceValid?: boolean;
}

interface FaceStatus {
  registered: boolean;
  registeredAt: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  not_checked_in: "ยังไม่ลงเวลา",
  checked_in: "ลงเวลาเข้าแล้ว",
  checked_out: "ลงเวลาออกแล้ว",
  late: "มาสาย",
  absent: "ขาด",
  leave: "ลา",
  travel: "ไปราชการ",
};

const STATUS_COLOR: Record<string, string> = {
  not_checked_in: "bg-surface-mid text-on-surface-variant",
  checked_in: "bg-blue-500/20 text-blue-800 dark:text-blue-300",
  checked_out: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300",
  late: "bg-orange-500/20 text-orange-800 dark:text-orange-300",
  absent: "bg-red-500/20 text-red-800 dark:text-red-300",
  leave: "bg-purple-500/20 text-purple-800 dark:text-purple-300",
  travel: "bg-cyan-100 text-cyan-800",
};

async function getToday(): Promise<TodayStatus> {
  try {
    return await apiFetch<TodayStatus>("/attendance/today");
  } catch {
    return { date: new Date().toISOString().split("T")[0], status: "not_checked_in", checkInAt: null, checkOutAt: null };
  }
}

async function getFaceStatus(): Promise<FaceStatus> {
  try {
    return await apiFetch<FaceStatus>("/attendance/face-status");
  } catch {
    return { registered: false, registeredAt: null };
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export default async function AttendancePage() {
  const [today, faceStatus] = await Promise.all([getToday(), getFaceStatus()]);

  const canCheckIn = today.status === "not_checked_in";
  const canCheckOut = today.status === "checked_in" || today.status === "late";

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Clock size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">ลงเวลาปฏิบัติราชการ</h1>
          <p className="text-xs text-on-surface-variant">ระบบลงเวลาด้วยใบหน้า + GPS</p>
        </div>
      </div>

      {/* Face Registration Alert */}
      {!faceStatus.registered && (
        <div className="mb-6 p-4 rounded-2xl bg-orange-50 border border-orange-200">
          <div className="flex items-center gap-3">
            <UserCheck size={20} className="text-orange-600" />
            <div className="flex-1">
              <p className="text-sm font-bold text-orange-800">ยังไม่ได้ลงทะเบียนใบหน้า</p>
              <p className="text-xs text-orange-600">กรุณาลงทะเบียนก่อนใช้งานระบบลงเวลา</p>
            </div>
            <Link href="/attendance/face" className="btn-primary text-xs px-4 py-2">
              ลงทะเบียน
            </Link>
          </div>
        </div>
      )}

      {/* Today Status Card */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm mb-6 p-6">
        <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-4">สถานะวันนี้</h2>
        <div className="flex items-center gap-4 mb-4">
          <span className={`inline-flex px-3 py-1 rounded-xl text-sm font-bold ${STATUS_COLOR[today.status] ?? STATUS_COLOR.not_checked_in}`}>
            {STATUS_LABEL[today.status] ?? today.status}
          </span>
          {today.geofenceValid === false && (
            <span className="text-xs text-orange-600 font-medium">⚠️ นอกเขตโรงเรียน</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-on-surface-variant text-xs">เวลาเข้า</span>
            <p className="font-bold text-lg">{formatTime(today.checkInAt)}</p>
          </div>
          <div>
            <span className="text-on-surface-variant text-xs">เวลาออก</span>
            <p className="font-bold text-lg">{formatTime(today.checkOutAt)}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          {canCheckIn && faceStatus.registered && (
            <Link href="/attendance/check-in?mode=in" className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:brightness-110 transition-all">
              <Camera size={16} /> ลงเวลาเข้า
            </Link>
          )}
          {canCheckOut && (
            <Link href="/attendance/check-in?mode=out" className="flex-1 flex items-center justify-center gap-2 py-3 bg-secondary text-on-secondary rounded-xl font-bold text-sm hover:brightness-110 transition-all">
              <Camera size={16} /> ลงเวลาออก
            </Link>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/attendance/face" className="p-4 rounded-2xl border border-outline-variant/20 bg-surface-lowest hover:bg-surface-low transition-colors text-center">
          <UserCheck size={24} className="mx-auto mb-2 text-primary" />
          <p className="text-xs font-bold text-on-surface">ลงทะเบียนใบหน้า</p>
        </Link>
        <Link href="/attendance/history" className="p-4 rounded-2xl border border-outline-variant/20 bg-surface-lowest hover:bg-surface-low transition-colors text-center">
          <CalendarDays size={24} className="mx-auto mb-2 text-secondary" />
          <p className="text-xs font-bold text-on-surface">ประวัติลงเวลา</p>
        </Link>
        <Link href="/leave" className="p-4 rounded-2xl border border-outline-variant/20 bg-surface-lowest hover:bg-surface-low transition-colors text-center">
          <CalendarDays size={24} className="mx-auto mb-2 text-tertiary" />
          <p className="text-xs font-bold text-on-surface">ลาหยุด</p>
        </Link>
        <Link href="/attendance/report" className="p-4 rounded-2xl border border-outline-variant/20 bg-surface-lowest hover:bg-surface-low transition-colors text-center">
          <BarChart3 size={24} className="mx-auto mb-2 text-on-surface-variant" />
          <p className="text-xs font-bold text-on-surface">รายงาน</p>
        </Link>
      </div>
    </div>
  );
}
