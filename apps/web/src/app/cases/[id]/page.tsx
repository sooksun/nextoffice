import { apiFetch } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";

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
  very_urgent: "ด่วนมาก",
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

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, options] = await Promise.all([getCase(id), getOptions(id)]);

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

      {/* Header */}
      <div className="mt-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-black text-primary tracking-tight">{c.title}</h1>
          <StatusBadge status={c.status} />
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-outline flex-wrap">
          {c.registrationNo && (
            <span className="font-mono bg-surface-low px-2 py-0.5 rounded-full border border-outline-variant/20">
              เลขรับ {c.registrationNo}
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
          <section className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
            <h2 className="text-xs font-bold text-outline uppercase tracking-wider mb-2">สรุปเนื้อหา</h2>
            <p className="text-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed">{c.intake.summaryText}</p>
          </section>
        )}

        {/* Metadata */}
        <section className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
          <h2 className="text-xs font-bold text-outline uppercase tracking-wider mb-3">รายละเอียด</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {c.intake?.documentNo && (
              <>
                <dt className="text-on-surface-variant">เลขที่หนังสือ</dt>
                <dd className="font-medium text-on-surface">{c.intake.documentNo}</dd>
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
        </section>

        {/* Director note */}
        {c.directorNote && (
          <section className="bg-primary/5 rounded-2xl border border-primary/15 p-5">
            <h2 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">คำสั่ง ผอ.</h2>
            <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{c.directorNote}</p>
          </section>
        )}

        {/* Next actions */}
        {c.intake?.nextActions && c.intake.nextActions.length > 0 && (
          <section className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
            <h2 className="text-xs font-bold text-outline uppercase tracking-wider mb-3">แนวทางดำเนินการ (AI)</h2>
            <ul className="space-y-1.5">
              {c.intake.nextActions.map((action, i) => (
                <li key={i} className="flex gap-2 text-sm text-on-surface-variant">
                  <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                  {action}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Topics */}
        {c.topics && c.topics.length > 0 && (
          <section className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
            <h2 className="text-xs font-bold text-outline uppercase tracking-wider mb-3">หมวดหมู่</h2>
            <div className="flex flex-wrap gap-2">
              {c.topics.map((t) =>
                t.topic ? (
                  <span key={t.id} className="px-3 py-1 rounded-full bg-primary/8 text-primary text-xs font-semibold">
                    {t.topic.topicNameTh}
                  </span>
                ) : null
              )}
            </div>
          </section>
        )}

        {/* AI Options */}
        {options.length > 0 && (
          <section className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
            <h2 className="text-xs font-bold text-outline uppercase tracking-wider mb-4">ตัวเลือกดำเนินการ (AI)</h2>
            <div className="space-y-3">
              {options.map((opt) => (
                <div key={opt.id} className="border border-outline-variant/20 rounded-2xl p-4 hover:border-primary/20 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-sm text-on-surface">{opt.title}</p>
                    {opt.overallScore !== null && (
                      <span className="text-[10px] bg-primary/8 text-primary px-2.5 py-0.5 rounded-full shrink-0 font-bold">
                        {(opt.overallScore * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {opt.description && (
                    <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">{opt.description}</p>
                  )}
                  {opt.policyComplianceNote && (
                    <p className="text-xs text-outline mt-1">นโยบาย: {opt.policyComplianceNote}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
