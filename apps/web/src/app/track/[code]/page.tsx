import { apiFetch } from "@/lib/api";
import { toThaiNumerals } from "@/lib/thai-date";
import { notFound } from "next/navigation";

interface TrackingData {
  registryType: string;
  registryNo: string | null;
  documentNo: string | null;
  documentDate: string | null;
  subject: string | null;
  fromOrg: string | null;
  toOrg: string | null;
  urgencyLevel: string | null;
  organizationName: string | null;
  folder: { name: string; code: string } | null;
  archivedAt: string | null;
  createdAt: string;
  caseStatus: string | null;
  timeline: { action: string; detail: string | null; date: string }[];
}

const TYPE_LABEL: Record<string, string> = {
  inbound: "หนังสือรับ",
  outbound: "หนังสือส่ง",
  archive: "เก็บรักษา",
  destroy: "ทำลาย",
};

const URGENCY_LABEL: Record<string, string> = {
  normal: "ปกติ",
  urgent: "ด่วน",
  very_urgent: "ด่วนมาก",
  most_urgent: "ด่วนที่สุด",
};

const ACTION_LABEL: Record<string, string> = {
  register: "ลงทะเบียน",
  assign: "มอบหมาย",
  update_status: "อัปเดตสถานะ",
  complete: "ดำเนินการเสร็จ",
  endorse: "ลงนาม",
  comment: "หมายเหตุ",
};

function formatThaiDate(iso: string): string {
  const d = new Date(iso);
  const str = d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
  return toThaiNumerals(str);
}

export default async function TrackPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let data: TrackingData;
  try {
    data = await apiFetch<TrackingData>(`/tracking/public/${code}`);
  } catch {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">ติดตามเอกสาร</h1>
          <p className="text-sm text-gray-500 mb-6">รหัส: {code}</p>

          <div className="space-y-3 mb-6">
            <InfoRow label="ประเภท" value={TYPE_LABEL[data.registryType] || data.registryType} />
            <InfoRow label="ทะเบียนเลขที่" value={data.registryNo ? toThaiNumerals(data.registryNo) : null} />
            <InfoRow label="เลขที่หนังสือ" value={data.documentNo ? toThaiNumerals(data.documentNo) : null} />
            <InfoRow label="เรื่อง" value={data.subject} />
            <InfoRow label="จาก" value={data.fromOrg} />
            <InfoRow label="ถึง" value={data.toOrg} />
            {data.urgencyLevel && data.urgencyLevel !== "normal" && (
              <InfoRow label="ความเร่งด่วน" value={URGENCY_LABEL[data.urgencyLevel] || data.urgencyLevel} />
            )}
            <InfoRow label="หน่วยงาน" value={data.organizationName} />
            {data.documentDate && <InfoRow label="ลงวันที่" value={formatThaiDate(data.documentDate)} />}
            <InfoRow label="วันที่รับเข้า" value={formatThaiDate(data.createdAt)} />
            {data.folder && <InfoRow label="แฟ้ม" value={`${toThaiNumerals(data.folder.code)} — ${data.folder.name}`} />}
            {data.caseStatus && <InfoRow label="สถานะ" value={data.caseStatus} />}
          </div>

          {data.timeline.length > 0 && (
            <>
              <h2 className="text-base font-semibold text-gray-900 mb-3">ประวัติการดำเนินการ</h2>
              <ol className="relative border-l-2 border-gray-200 ml-3 space-y-4">
                {data.timeline.map((t, i) => (
                  <li key={i} className="ml-4">
                    <div className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                    <p className="text-sm font-medium text-gray-900">
                      {ACTION_LABEL[t.action] || t.action}
                    </p>
                    {t.detail && <p className="text-xs text-gray-500">{t.detail}</p>}
                    <p className="text-xs text-gray-400">{formatThaiDate(t.date)}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">NextOffice — ระบบสำนักงานอิเล็กทรอนิกส์</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-sm text-gray-500 w-28 shrink-0">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}
