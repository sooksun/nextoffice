import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, FileText, Clock, User } from "lucide-react";
import clsx from "clsx";
import PdfPreview from "@/components/PdfPreview";
import SignatureVerification from "@/components/SignatureVerification";
import { formatThaiDate, formatThaiDateShort, formatThaiDateTime, toThaiNumerals } from "@/lib/thai-date";
import RegisterButton from "@/components/actions/RegisterButton";
import AssignButton from "@/components/actions/AssignButton";
import AcknowledgeButton from "@/components/actions/AcknowledgeButton";
import CompleteButton from "@/components/actions/CompleteButton";
import EndorsementPanel from "@/components/actions/EndorsementPanel";
import CreateResponseDocButton from "@/components/actions/CreateResponseDocButton";
import { Card, CardContent } from "@/components/ui/card";
import { UrgencyBadge, CaseStatusBadge } from "@/components/status-badges";

export const dynamic = "force-dynamic";

/** แปลงเลขไทย ๐-๙ เป็นเลขอารบิค 0-9 */
function thaiToArabic(str: string | null | undefined): string {
  if (!str) return str ?? "";
  return str.replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0E50));
}

const URGENCY_LABEL: Record<string, string> = {
  normal: "ปกติ", urgent: "ด่วน", very_urgent: "ด่วนที่สุด", most_urgent: "ด่วนที่สุด",
};

const SECURITY_LABEL: Record<string, string> = {
  normal: "ปกติ", confidential: "ปกปิด", secret: "ลับ", top_secret: "ลับมาก", most_secret: "ลับที่สุด",
};

interface IntakeFile {
  id: number;
  storagePath: string | null;
  mimeType: string;
  originalFileName: string | null;
  fileSize: number | null;
  nextActions?: string[];
  summaryText?: string | null;
  documentNo?: string | null;
  issuingAuthority?: string | null;
  documentDate?: string | null;
}

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
  intake?: IntakeFile | null;
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
  detail: Record<string, unknown> | null;
  user: { id: number; fullName: string; roleCode: string } | null;
  createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  register: "ลงรับหนังสือ", assign: "มอบหมายงาน", comment: "แสดงความคิดเห็น",
  update_status: "เปลี่ยนสถานะ", select_option: "เลือกแนวทาง", complete: "เสร็จสิ้น",
  close: "ปิดเรื่อง", auto_complete: "เสร็จอัตโนมัติ",
};

const ASSIGNMENT_STATUS: Record<string, string> = {
  pending: "รอรับทราบ", accepted: "รับทราบแล้ว", in_progress: "กำลังดำเนินการ", completed: "เสร็จสิ้น",
};

const ASSIGNMENT_STATUS_CLS: Record<string, string> = {
  completed: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  accepted: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  in_progress: "bg-orange-500/20 text-orange-800 dark:text-orange-300",
  pending: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
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

/** URL ไฟล์ — ถ้า status ผ่าน registered ขึ้นไป ให้ดึง stamped version */
function buildFileUrl(intakeId: number, status: string): string {
  const showStamped = !["new", "analyzing", "proposed"].includes(status);
  return `/api/files/intake/${intakeId}${showStamped ? "?stamped=true" : ""}`;
}

const sectionHead = "text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-4";

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

  const hasFile = !!(caseData?.intake?.id && caseData?.intake?.storagePath);
  const intakeFileUrl = hasFile ? buildFileUrl(caseData!.intake!.id, caseData!.status) : null;
  const intakeMimeType = caseData?.intake?.mimeType ?? "";
  const intakeFileName = caseData?.intake?.originalFileName ?? null;

  const senderFallback = parseSenderFromDescription(caseData?.description ?? null);
  const issuingAuthority =
    caseData?.sourceDocument?.issuingAuthority ??
    caseData?.intake?.issuingAuthority ??
    senderFallback.issuingAuthority;
  const documentCode =
    caseData?.sourceDocument?.documentCode ??
    caseData?.intake?.documentNo ??
    senderFallback.documentCode;
  const documentDate = caseData?.intake?.documentDate ?? null;

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
            <UrgencyBadge level={caseData.urgencyLevel} />
            <CaseStatusBadge status={caseData.status} />
            {caseData.registrationNo && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-mono font-bold text-primary bg-primary/10">
                เลขรับ {toThaiNumerals(caseData.registrationNo)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-6 p-4 bg-surface-bright rounded-2xl border border-outline-variant/40">
        <RegisterButton caseId={caseData.id} status={caseData.status} />
        <AssignButton
          caseId={caseData.id}
          status={caseData.status}
          caseDueDate={caseData.dueDate}
          nextActions={caseData.intake?.nextActions}
        />
        <AcknowledgeButton caseId={caseData.id} assignments={assignments} />
        <CompleteButton caseId={caseData.id} assignments={assignments} />
        {["assigned", "in_progress"].includes(caseData.status) && (
          <CreateResponseDocButton
            caseId={caseData.id}
            caseTitle={caseData.title}
            directorNote={caseData.directorNote}
          />
        )}
      </div>

      {/* Original file preview */}
      {intakeFileUrl && (
        <Card className="mb-6 overflow-hidden">
          <PdfPreview src={intakeFileUrl} mimeType={intakeMimeType} fileName={intakeFileName} />
        </Card>
      )}

      {/* Digital Signature Verification */}
      {caseData?.intake?.id && !["new", "analyzing", "proposed"].includes(caseData.status) && (
        <div className="mb-4">
          <SignatureVerification type="intake" id={caseData.intake.id} />
        </div>
      )}

      {/* Metadata */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <h2 className={sectionHead}>ข้อมูลหนังสือ</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="col-span-2">
              <span className="text-on-surface-variant text-xs">ชื่อเรื่อง:</span>
              <p className="font-semibold text-on-surface mt-0.5">{caseData.title || "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant text-xs">หน่วยงานที่ส่ง:</span>
              <p className="font-medium">{issuingAuthority || "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant text-xs">หน่วยงานรับ:</span>
              <p className="font-medium">{caseData.organization?.name || "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant text-xs">ที่หนังสือ:</span>
              <p className="font-medium font-mono">
                {documentCode ? toThaiNumerals(thaiToArabic(documentCode)) : "—"}
              </p>
            </div>
            <div>
              <span className="text-on-surface-variant text-xs">วันที่หนังสือ:</span>
              <p className="font-medium">{documentDate ? formatThaiDateShort(documentDate) : "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant text-xs">เลขทะเบียนรับ:</span>
              {caseData.registrationNo ? (
                <p className="font-bold font-mono text-primary text-base">{toThaiNumerals(caseData.registrationNo)}</p>
              ) : (
                <p className="text-on-surface-variant italic text-xs">ยังไม่ได้ลงรับ</p>
              )}
            </div>
            <div>
              <span className="text-on-surface-variant text-xs">วันที่รับ:</span>
              <p className="font-medium">{formatThaiDate(caseData.receivedAt)}</p>
            </div>
            <div>
              <span className="text-on-surface-variant text-xs">กำหนดเสร็จ:</span>
              <p className="font-medium">{caseData.dueDate ? formatThaiDate(caseData.dueDate) : "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant text-xs">ความเร่งด่วน:</span>
              <p className="font-medium">{URGENCY_LABEL[caseData.urgencyLevel]}</p>
            </div>
            <div>
              <span className="text-on-surface-variant text-xs">ชั้นความลับ:</span>
              <p className="font-medium">{SECURITY_LABEL[caseData.securityLevel] || SECURITY_LABEL.normal}</p>
            </div>
          </div>
          {caseData.description && (
            <div className="mt-4 pt-4 border-t border-outline-variant/30">
              <span className="text-on-surface-variant text-sm">หมายเหตุ:</span>
              <p className="text-sm mt-1 whitespace-pre-wrap">{caseData.description}</p>
            </div>
          )}
          {caseData.directorNote && (
            <div className="mt-4 pt-4 border-t border-outline-variant/30">
              <span className="text-on-surface-variant text-sm">คำสั่งผู้บริหาร:</span>
              <p className="text-sm mt-1 whitespace-pre-wrap font-medium text-primary">{caseData.directorNote}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assignments */}
      {assignments.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <h2 className={sectionHead}>
              <User size={14} className="inline mr-1" />
              การมอบหมายงาน ({toThaiNumerals(assignments.length)})
            </h2>
            <div className="space-y-3">
              {assignments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface-low border border-outline-variant/30"
                >
                  <div>
                    <p className="font-medium text-sm">{a.assignedTo.fullName}</p>
                    <p className="text-xs text-on-surface-variant">
                      {a.assignedTo.department || a.assignedTo.roleCode} |{" "}
                      {a.role === "responsible" ? "ผู้รับผิดชอบ" : a.role === "informed" ? "รับทราบ" : "สำเนา"}
                    </p>
                    {a.note && <p className="text-xs text-on-surface-variant mt-1">{a.note}</p>}
                  </div>
                  <div className="text-right">
                    <span
                      className={clsx(
                        "inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold",
                        ASSIGNMENT_STATUS_CLS[a.status] ?? ASSIGNMENT_STATUS_CLS.pending,
                      )}
                    >
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
          </CardContent>
        </Card>
      )}

      {/* Endorsement Panel */}
      <EndorsementPanel caseId={caseData.id} directorNote={caseData.directorNote} />

      {/* Activity Timeline */}
      {activities.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className={sectionHead}>
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
                    {!!a.detail?.registrationNo && (
                      <p className="text-xs text-on-surface-variant">
                        เลขรับ: {toThaiNumerals(String(a.detail.registrationNo))}
                      </p>
                    )}
                    {!!a.detail?.from && !!a.detail?.to && (
                      <p className="text-xs text-on-surface-variant">
                        {String(a.detail.from)} &rarr; {String(a.detail.to)}
                      </p>
                    )}
                    <p className="text-xs text-on-surface-variant">{formatThaiDateTime(a.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
