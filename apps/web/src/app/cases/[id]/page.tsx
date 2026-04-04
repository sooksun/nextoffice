import { apiFetch } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface CaseOption {
  id: string;
  optionLabel: string;
  rationale: string | null;
  estimatedEffort: string | null;
  alignmentScore: number | null;
}

interface InboundCase {
  id: string;
  caseStatus: string;
  priorityScore: number | null;
  ragSummary: string | null;
  horizonSummary: string | null;
  policySummary: string | null;
  contextSummary: string | null;
  createdAt: string;
}

async function getCase(id: string) {
  try {
    return await apiFetch<InboundCase>(`/cases/${id}`);
  } catch {
    return null;
  }
}

async function getOptions(id: string) {
  try {
    return await apiFetch<CaseOption[]>(`/cases/${id}/options`);
  } catch {
    return [];
  }
}

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, options] = await Promise.all([getCase(id), getOptions(id)]);

  if (!c) {
    return (
      <div>
        <Link href="/cases" className="text-primary hover:text-secondary text-sm font-bold">← กลับ</Link>
        <p className="mt-4 text-on-surface-variant">ไม่พบเคส #{id}</p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/cases" className="text-primary hover:text-secondary text-sm font-bold">← กลับ</Link>
      <div className="flex items-center gap-3 mt-3 mb-6">
        <h1 className="text-3xl font-black text-primary tracking-tight">เคส #{c.id}</h1>
        <StatusBadge status={c.caseStatus} />
      </div>

      <div className="space-y-5">
        <section className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
          <h2 className="font-bold text-primary mb-3">สรุป RAG</h2>
          <p className="text-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed">{c.ragSummary ?? "—"}</p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <RagSection title="Horizon RAG" content={c.horizonSummary} />
          <RagSection title="Policy RAG" content={c.policySummary} />
          <RagSection title="Context Engine" content={c.contextSummary} />
        </div>

        {options.length > 0 && (
          <section className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
            <h2 className="font-bold text-primary mb-4">ตัวเลือกดำเนินการ</h2>
            <div className="space-y-3">
              {options.map((opt) => (
                <div key={opt.id} className="border border-outline-variant/20 rounded-2xl p-4 hover:border-primary/20 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-sm text-on-surface">{opt.optionLabel}</p>
                    {opt.alignmentScore !== null && (
                      <span className="text-[10px] bg-secondary-fixed text-secondary px-2.5 py-0.5 rounded-full shrink-0 font-bold">
                        {(opt.alignmentScore * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {opt.rationale && <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">{opt.rationale}</p>}
                  {opt.estimatedEffort && (
                    <p className="text-xs text-outline mt-1">ระยะเวลา: {opt.estimatedEffort}</p>
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

function RagSection({ title, content }: { title: string; content: string | null }) {
  return (
    <section className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-4 shadow-sm">
      <h3 className="text-[10px] font-bold text-outline uppercase tracking-wider mb-2">{title}</h3>
      <p className="text-sm text-on-surface-variant leading-relaxed">{content ?? "—"}</p>
    </section>
  );
}
