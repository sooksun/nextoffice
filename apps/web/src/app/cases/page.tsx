import { apiFetch } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";
import { formatThaiDateShort } from "@/lib/thai-date";

export const dynamic = "force-dynamic";

interface InboundCase {
  id: string;
  caseStatus: string;
  priorityScore: number | null;
  ragSummary: string | null;
  createdAt: string;
}

async function getCases(): Promise<InboundCase[]> {
  try {
    return await apiFetch<InboundCase[]>("/cases");
  } catch {
    return [];
  }
}

export default async function CasesPage() {
  const cases = await getCases();

  return (
    <div>
      <h1 className="text-3xl font-black text-primary tracking-tight mb-6">เคส</h1>
      {cases.length === 0 ? (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center text-outline shadow-sm">
          ยังไม่มีเคส
        </div>
      ) : (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-low border-b border-outline-variant/10">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ID</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สถานะ</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">คะแนน</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สรุป RAG</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันที่</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-surface-low transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/cases/${c.id}`} className="text-primary hover:text-secondary font-mono text-xs font-bold">
                      #{c.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={c.caseStatus} /></td>
                  <td className="px-4 py-3 text-on-surface-variant">{c.priorityScore ?? "—"}</td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs max-w-xs truncate">{c.ragSummary ?? "—"}</td>
                  <td className="px-4 py-3 text-outline text-xs">
                    {formatThaiDateShort(c.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
