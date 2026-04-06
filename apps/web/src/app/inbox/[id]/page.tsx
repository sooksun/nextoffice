import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, FileText, Clock, User } from "lucide-react";
import { formatThaiDate, formatThaiDateShort, formatThaiDateTime } from "@/lib/thai-date";
import RegisterButton from "@/components/actions/RegisterButton";
import AssignButton from "@/components/actions/AssignButton";
import AcknowledgeButton from "@/components/actions/AcknowledgeButton";
import CompleteButton from "@/components/actions/CompleteButton";

export const dynamic = "force-dynamic";

const URGENCY_LABEL: Record<string, string> = {
  normal: "ทั่วไป", urgent: "ด่วน", very_urgent: "ด่วนมาก", most_urgent: "ด่วนที่สุด",
};
const URGENCY_COLOR: Record<string, string> = {
  normal: "bg-blue-100 text-blue-800", urgent: "bg-yellow-100 text-yellow-800",
  very_urgent: "bg-orange-100 text-orange-800", most_urgent: "bg-red-100 text-red-800",
};
const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่", analyzing: "วิเคราะห์", proposed: "เสนอ AI", registered: "ลงรับแล้ว",
  assigned: "มอบหมายแล้ว", in_progress: "กำลังดำเนินการ", completed: "เสร็จสิ้น", archived: "เก็บถาวร",
};
const ASSIGNMENT_STATUS: Record<string, string> = {
  pending: "รอรับทราบ", accepted: "รับทราบแล้ว", in_progress: "กำลังดำเนินการ", completed: "เสร็จสิ้น",
};

interface CaseDetail {
  id: number;
  title: string;
  description: string | null;
  registrationNo: string | null;
  status: string;
  urgencyLevel: string;
  securityLevel: string;
  receivedAt: string;
  registeredAt: string | null;
  dueDate: string | null;
  directorNote: string | null;
  organization: { id: number; name: string } | null;
  sourceDocument: { id: number; issuingAuthority: string | null; documentCode: string | null } | null;
  assignedTo: { id: number; fullName: string } | null;
}

interface Assignment {
  id: number;
  role: string;
  status: string;
  dueDate: string | null;
  note: string | null;
  completedAt: string | null;
  assignedTo: { id: number; fullName: string; roleCode: string; department: string | null };
  assignedBy: { id: number; fullName: string; roleCode: string };
  createdAt: string;
}

interface Activity {
  id: number;
  action: string;
  detail: any;
  user: { id: number; fullName: string; roleCode: string } | null;
  createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  register: "ลงรับหนังสือ", assign: "มอบหมายงาน", comment: "แสดงความคิดเห็น",
  update_status: "เปลี่ยนสถานะ", select_option: "เลือกแนวทาง", complete: "เสร็จสิ้น",
  close: "ปิดเรื่อง", auto_complete: "เสร็จอัตโนมัติ",
};

/** For manually-created cases (no sourceDocument), parse senderOrg/docNo from description text */
function parseSenderFromDescription(desc: string | null) {
  if (!desc) return { documentCode: null, issuingAuthority: null };
  const docNo = desc.match(/เลขที่หนังสือ:\s*(.+)/)?.[1]?.trim() ?? null;
  const sender = desc.match(/หน่วยงานที่ส่ง:\s*(.+)/)?.[1]?.trim() ?? null;
  return { documentCode: docNo, issuingAuthority: sender };
}

async function getCase(id: string) {
  try { return await apiFetch<CaseDetail>(`/cases/${id}`); } catch { return null; }
}
async function getAssignments(id: string) {
  try { return await apiFetch<Assignment[]>(`/cases/${id}/assignments`); } catch { return []; }
}
async function getActivities(id: string) {
  try { return await apiFetch<Activity[]>(`/cases/${id}/activities`); } catch { return []; }
}

export default async function InboxDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [caseData, assignments, activities] = await Promise.all([
    getCase(id),
    getAssignments(id),
    getActivities(id),
  ]);

  // Fallback: parse sender info from description for legacy manual cases (no sourceDocument)
  const senderFallback = parseSenderFromDescription(caseData?.description ?? null);
  const issuingAuthority = caseData?.sourceDocument?.issuingAuthority ?? senderFallback.issuingAuthority;
  const documentCode = caseData?.sourceDocument?.documentCode ?? senderFallback.documentCode;

  if (!caseData) {
    return (
      <div className="text-center py-20">
        <p className="text-on-surface-variant">ไม่พบเอกสาร</p>
        <Link href="/inbox" className="text-primary hover:underline text-sm mt-2 inline-block">กลับ</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back */}
      <Link href="/inbox" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> ย้อนกลับ
      </Link>

      {/* Title */}
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-1">
          <FileText size={20} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-on-surface leading-tight mb-2">{caseData.title}</h1>
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${URGENCY_COLOR[caseData.urgencyLevel]}`}>
              {URGENCY_LABEL[caseData.urgencyLevel]}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-surface-bright text-on-surface-variant">
              {STATUS_LABEL[caseData.status]}
            </span>
            {caseData.registrationNo && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-mono font-bold text-primary bg-primary/5">
                เลขรับ {caseData.registrationNo}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-6 p-4 bg-surface-bright rounded-2xl border border-outline-variant/20">
        <RegisterButton caseId={caseData.id} status={caseData.status} />
        <AssignButton caseId={caseData.id} status={caseData.status} />
        <AcknowledgeButton caseId={caseData.id} assignments={assignments} />
        <CompleteButton caseId={caseData.id} assignments={assignments} />
      </div>

      {/* Document Metadata */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm mb-6">
        <div className="p-5">
          <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-4">ข้อมูลหนังสือ</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-on-surface-variant">หน่วยงานที่ส่ง:</span>
              <p className="font-medium">{issuingAuthority || "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">หน่วยงานรับ:</span>
              <p className="font-medium">{caseData.organization?.name || "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">เลขที่หนังสือ:</span>
              <p className="font-medium">{documentCode || "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">เลขทะเบียนรับ:</span>
              <p className="font-medium font-mono">{caseData.registrationNo || "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">วันที่รับ:</span>
              <p className="font-medium">{formatThaiDate(caseData.receivedAt)}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">กำหนดเสร็จ:</span>
              <p className="font-medium">{caseData.dueDate ? formatThaiDate(caseData.dueDate) : "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">ประเภทเอกสาร:</span>
              <p className="font-medium">{URGENCY_LABEL[caseData.urgencyLevel]}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">ชั้นความลับ:</span>
              <p className="font-medium">{caseData.securityLevel || "ปกติ"}</p>
            </div>
          </div>
          {caseData.description && (
            <div className="mt-4 pt-4 border-t border-outline-variant/10">
              <span className="text-on-surface-variant text-sm">หมายเหตุ:</span>
              <p className="text-sm mt-1 whitespace-pre-wrap">{caseData.description}</p>
            </div>
          )}
          {caseData.directorNote && (
            <div className="mt-4 pt-4 border-t border-outline-variant/10">
              <span className="text-on-surface-variant text-sm">คำสั่งผู้บริหาร:</span>
              <p className="text-sm mt-1 whitespace-pre-wrap font-medium text-primary">{caseData.directorNote}</p>
            </div>
          )}
        </div>
      </div>

      {/* Assignments */}
      {assignments.length > 0 && (
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm mb-6">
          <div className="p-5">
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-4">
              <User size={14} className="inline mr-1" />
              การมอบหมายงาน ({assignments.length})
            </h2>
            <div className="space-y-3">
              {assignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-bright">
                  <div>
                    <p className="font-medium text-sm">{a.assignedTo.fullName}</p>
                    <p className="text-xs text-on-surface-variant">
                      {a.assignedTo.department || a.assignedTo.roleCode} | {a.role === "responsible" ? "ผู้รับผิดชอบ" : a.role === "informed" ? "รับทราบ" : "สำเนา"}
                    </p>
                    {a.note && <p className="text-xs text-on-surface-variant mt-1">{a.note}</p>}
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${
                      a.status === "completed" ? "bg-green-100 text-green-800" :
                      a.status === "accepted" ? "bg-blue-100 text-blue-800" :
                      "bg-yellow-100 text-yellow-800"
                    }`}>
                      {ASSIGNMENT_STATUS[a.status] ?? a.status}
                    </span>
                    {a.dueDate && (
                      <p className="text-xs text-on-surface-variant mt-1">
                        กำหนด: {formatThaiDateShort(a.dueDate)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      {activities.length > 0 && (
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
          <div className="p-5">
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-4">
              <Clock size={14} className="inline mr-1" />
              ประวัติกิจกรรม
            </h2>
            <div className="space-y-3">
              {activities.map((a) => (
                <div key={a.id} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">
                      {ACTION_LABEL[a.action] ?? a.action}
                      {a.user && <span className="text-on-surface-variant font-normal"> โดย {a.user.fullName}</span>}
                    </p>
                    {a.detail?.registrationNo && (
                      <p className="text-xs text-on-surface-variant">เลขรับ: {a.detail.registrationNo}</p>
                    )}
                    {a.detail?.from && a.detail?.to && (
                      <p className="text-xs text-on-surface-variant">{a.detail.from} &rarr; {a.detail.to}</p>
                    )}
                    <p className="text-xs text-on-surface-variant">
                      {formatThaiDateTime(a.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
