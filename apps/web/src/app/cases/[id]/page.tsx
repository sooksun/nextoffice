import { apiFetch } from "@/lib/api";
import { toThaiNumerals } from "@/lib/thai-date";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AcknowledgeButton from "@/components/actions/AcknowledgeButton";
import CompleteButton from "@/components/actions/CompleteButton";
import CreateResponseDocButton from "@/components/actions/CreateResponseDocButton";

export const dynamic = "force-dynamic";

interface CaseOption {
  id: number;
  code: string;
  title: string;
  description: string | null;
  overallScore: number | null;
  policyComplianceNote: string | null;
}

interface CaseOptionsResponse {
  caseId: number;
  options: CaseOption[];
}

interface InboundCase {
  id: number;
  status: string;
  title: string;
  description: string | null;
  urgencyLevel: string;
  registrationNo: string | null;
  directorNote: string | null;
  dueDate: string | null;
  createdAt: string;
  organization: { id: number; name: string } | null;
  assignedTo: { id: number; fullName: string; roleCode: string } | null;
  registeredBy: { id: number; fullName: string } | null;
  topics: { id: number; topic: { id: number; topicNameTh: string } | null }[];
  intake?: {
    id: number;
    storagePath: string | null;
    mimeType: string | null;
    originalFileName: string | null;
    fileSize: number | null;
    nextActions: string[];
    summaryText: string | null;
    documentNo: string | null;
    issuingAuthority: string | null;
    documentDate: string | null;
  };
}

const URGENCY_LABEL: Record<string, string> = {
  most_urgent: "ด่วนที่สุด",
  very_urgent: "ด่วนที่สุด",
  urgent: "ด่วน",
  normal: "ปกติ",
};

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่",
  analyzing: "กำลังวิเคราะห์",
  proposed: "มีข้อเสนอแนะ",
  registered: "ลงรับแล้ว",
  assigned: "มอบหมายแล้ว",
  in_progress: "กำลังดำเนินการ",
  completed: "เสร็จแล้ว",
  archived: "เก็บถาวร",
};

interface Assignment {
  id: number;
  role: string;
  status: string;
  assignedTo: { id: number; fullName: string };
}

async function getCase(id: string) {
  try {
    return await apiFetch<InboundCase>(`/cases/${id}`);
  } catch {
    return null;
  }
}

async function getOptions(id: string): Promise<CaseOption[]> {
  try {
    const res = await apiFetch<CaseOptionsResponse>(`/cases/${id}/options`);
    return res.options ?? [];
  } catch {
    return [];
  }
}

async function getAssignments(id: string): Promise<Assignment[]> {
  try {
    return await apiFetch<Assignment[]>(`/cases/${id}/assignments`);
  } catch {
    return [];
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const sectionHead = "text-xs font-bold text-on-surface-variant uppercase tracking-wider";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, options, assignments] = await Promise.all([getCase(id), getOptions(id), getAssignments(id)]);

  if (!c) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <Link href="/cases" className="text-primary hover:text-secondary text-sm font-bold">← กลับ</Link>
        <p className="mt-4 text-on-surface-variant">ไม่พบเคส #{id}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <Link href="/cases" className="text-primary hover:text-secondary text-sm font-bold">← กลับ</Link>

      {/* Action buttons */}
      {(assignments.length > 0 || ["assigned", "in_progress"].includes(c.status)) && (
        <div className="flex flex-wrap gap-3 mt-4 mb-2 p-4 bg-surface-bright rounded-2xl border border-outline-variant/40">
          <AcknowledgeButton caseId={c.id} assignments={assignments} />
          <CompleteButton caseId={c.id} assignments={assignments} />
          {["assigned", "in_progress"].includes(c.status) && (
            <CreateResponseDocButton
              caseId={c.id}
              caseTitle={c.title}
              directorNote={c.directorNote}
            />
          )}
        </div>
      )}

      {/* Header */}
      <div className="mt-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-black text-primary tracking-tight">{c.title}</h1>
          <StatusBadge status={c.status} />
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-on-surface-variant flex-wrap">
          {c.registrationNo && (
            <span className="font-mono bg-surface-mid px-2 py-0.5 rounded-full border border-outline-variant/40">
              เลขรับ {toThaiNumerals(c.registrationNo)}
            </span>
          )}
          <span>{URGENCY_LABEL[c.urgencyLevel] ?? c.urgencyLevel}</span>
          {c.dueDate && <span>กำหนด {formatDate(c.dueDate)}</span>}
          <span>รับเข้า {formatDate(c.createdAt)}</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Summary from intake */}
        {c.intake?.summaryText && (
          <Card>
            <CardContent className="p-5">
              <h2 className={`${sectionHead} mb-2`}>สรุปเนื้อหา</h2>
              <p className="text-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed">{c.intake.summaryText}</p>
            </CardContent>
          </Card>
        )}

        {/* Metadata */}
        <Card>
          <CardContent className="p-5">
            <h2 className={`${sectionHead} mb-3`}>รายละเอียด</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {c.intake?.documentNo && (
                <>
                  <dt className="text-on-surface-variant">เลขที่หนังสือ</dt>
                  <dd className="font-medium text-on-surface">{toThaiNumerals(c.intake.documentNo)}</dd>
                </>
              )}
              {c.intake?.issuingAuthority && (
                <>
                  <dt className="text-on-surface-variant">จาก</dt>
                  <dd className="font-medium text-on-surface">{c.intake.issuingAuthority}</dd>
                </>
              )}
              {c.organization && (
                <>
                  <dt className="text-on-surface-variant">หน่วยงาน</dt>
                  <dd className="font-medium text-on-surface">{c.organization.name}</dd>
                </>
              )}
              {c.registeredBy && (
                <>
                  <dt className="text-on-surface-variant">ลงรับโดย</dt>
                  <dd className="font-medium text-on-surface">{c.registeredBy.fullName}</dd>
                </>
              )}
              {c.assignedTo && (
                <>
                  <dt className="text-on-surface-variant">ผู้รับผิดชอบ</dt>
                  <dd className="font-medium text-on-surface">{c.assignedTo.fullName}</dd>
                </>
              )}
              <dt className="text-on-surface-variant">สถานะ</dt>
              <dd className="font-medium text-on-surface">{STATUS_LABEL[c.status] ?? c.status}</dd>
            </dl>
          </CardContent>
        </Card>

        {/* Director note — primary-tinted callout */}
        {c.directorNote && (
          <Card className="bg-primary/5 border-primary/30">
            <CardContent className="p-5">
              <h2 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">คำสั่ง ผอ.</h2>
              <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{c.directorNote}</p>
            </CardContent>
          </Card>
        )}

        {/* Next actions */}
        {c.intake?.nextActions && c.intake.nextActions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className={sectionHead}>แนวทางดำเนินการ (AI)</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {c.intake.nextActions.map((action, i) => (
                  <li key={i} className="flex gap-2 text-sm text-on-surface-variant">
                    <span className="text-primary font-bold shrink-0">{toThaiNumerals(i + 1)}.</span>
                    {action}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Topics */}
        {c.topics && c.topics.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className={sectionHead}>หมวดหมู่</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {c.topics.map((t) =>
                  t.topic ? (
                    <span key={t.id} className="px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold">
                      {t.topic.topicNameTh}
                    </span>
                  ) : null
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Options */}
        {options.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className={sectionHead}>ตัวเลือกดำเนินการ (AI)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {options.map((opt) => (
                  <div
                    key={opt.id}
                    className="border border-outline-variant/50 rounded-2xl p-4 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-on-surface">{opt.title}</p>
                      {opt.overallScore !== null && (
                        <span className="text-[10px] bg-primary/15 text-primary px-2.5 py-0.5 rounded-full shrink-0 font-bold">
                          {toThaiNumerals((opt.overallScore * 100).toFixed(0))}%
                        </span>
                      )}
                    </div>
                    {opt.description && (
                      <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">{opt.description}</p>
                    )}
                    {opt.policyComplianceNote && (
                      <p className="text-xs text-on-surface-variant/80 mt-1">นโยบาย: {opt.policyComplianceNote}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
