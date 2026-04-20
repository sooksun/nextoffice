import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  sick: "ลาป่วย", personal: "ลากิจส่วนตัว", vacation: "ลาพักผ่อน",
  maternity: "ลาคลอด", ordination: "ลาบวช", training: "ลาศึกษาต่อ/อบรม",
};

function formatDateLong(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
    "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  return `${d.getDate()} ${months[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`;
}

interface LeaveDetail {
  id: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string | null;
  contactPhone?: string | null;
  contactAddress?: string | null;
  positionTitle?: string | null;
  status: string;
  createdAt: string;
  user?: { fullName: string; positionTitle?: string | null; organization?: { name: string } | null } | null;
}

async function getLeave(id: string): Promise<LeaveDetail | null> {
  try { return await apiFetch<LeaveDetail>(`/attendance/leave/${id}`); } catch { return null; }
}

export default async function PrintLeavePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leave = await getLeave(id);
  if (!leave) notFound();

  const writtenDate = formatDateLong(leave.createdAt);
  const startDateTH = formatDateLong(leave.startDate);
  const endDateTH   = formatDateLong(leave.endDate);

  return (
    <>
      {/* Print button — hidden when printing */}
      <div className="print:hidden flex gap-3 p-4 bg-surface-low border-b border-outline-variant/30">
        <PrintButton />
        <a href="/leave" className="btn-ghost text-sm">← กลับ</a>
      </div>

      {/* Document */}
      <div className="max-w-2xl mx-auto p-8 print:p-0 print:max-w-none font-sarabun">
        <div className="text-right text-sm mb-2">เขียนที่ ___________________________</div>
        <div className="text-right text-sm mb-8">วันที่ {writtenDate}</div>

        <h1 className="text-center text-xl font-bold mb-6">
          ใบลา{TYPE_LABEL[leave.leaveType] ?? leave.leaveType}
        </h1>

        <div className="space-y-4 text-sm leading-relaxed">
          <div>
            <span className="font-semibold">เรื่อง</span>&nbsp;&nbsp;ขอลา{TYPE_LABEL[leave.leaveType] ?? leave.leaveType}
          </div>

          <div>
            <span className="font-semibold">เรียน</span>&nbsp;&nbsp;ผู้อำนวยการ
          </div>

          <div className="pt-2">
            ข้าพเจ้า{" "}
            <span className="border-b border-black min-w-[180px] inline-block px-1">
              {leave.user?.fullName ?? ""}
            </span>{" "}
            ตำแหน่ง{" "}
            <span className="border-b border-black min-w-[180px] inline-block px-1">
              {leave.positionTitle ?? ""}
            </span>
          </div>

          <div>
            สังกัด{" "}
            <span className="border-b border-black min-w-[240px] inline-block px-1">
              {leave.user?.organization?.name ?? ""}
            </span>
          </div>

          <div>
            มีความประสงค์ขอลา{TYPE_LABEL[leave.leaveType] ?? leave.leaveType}{" "}
            ตั้งแต่วันที่{" "}
            <span className="border-b border-black min-w-[160px] inline-block px-1">{startDateTH}</span>{" "}
            ถึงวันที่{" "}
            <span className="border-b border-black min-w-[160px] inline-block px-1">{endDateTH}</span>{" "}
            มีกำหนด{" "}
            <span className="font-bold">{Number(leave.totalDays)}</span>{" "}
            วัน
          </div>

          <div>
            เพราะเหตุ{" "}
            <span className="border-b border-black min-w-[300px] inline-block px-1">
              {leave.reason ?? ""}
            </span>
          </div>

          <div>
            ระหว่างลาพักอยู่ที่{" "}
            <span className="border-b border-black min-w-[280px] inline-block px-1">
              {leave.contactAddress ?? ""}
            </span>
          </div>

          <div>
            โทรศัพท์ที่ติดต่อได้{" "}
            <span className="border-b border-black min-w-[160px] inline-block px-1">
              {leave.contactPhone ?? ""}
            </span>
          </div>
        </div>

        {/* Signature */}
        <div className="mt-12 flex justify-end">
          <div className="text-center">
            <div className="mb-12 text-sm">(ลงชื่อ)__________________________</div>
            <div className="text-sm">
              ({leave.user?.fullName ?? ""})
            </div>
            <div className="text-sm text-on-surface-variant mt-1">ผู้ขอลา</div>
          </div>
        </div>

        {/* Status badge — hidden when printing if you want clean form */}
        <div className="mt-8 pt-4 border-t border-outline-variant/30 text-xs text-on-surface-variant print:hidden">
          ใบลา #{leave.id} · สถานะ: {leave.status}
        </div>
      </div>
    </>
  );
}
