import { apiFetch } from "@/lib/api";
import { formatThaiDate } from "@/lib/thai-date";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";
import {
  FolderKanban,
  Calendar,
  Banknote,
  FileText,
  Tag,
  ArrowLeft,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface LinkedDocument {
  id: number;
  docNo: string | null;
  subject: string | null;
  createdAt: string;
}

interface ProjectTopic {
  id: number;
  topicName: string;
}

interface ProjectDetail {
  id: number;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budgetAmount: number | null;
  budgetYear: number | null;
  documents: LinkedDocument[];
  topics: ProjectTopic[];
}

async function getProject(id: string): Promise<ProjectDetail | null> {
  try {
    return await apiFetch<ProjectDetail>(`/projects/${id}`);
  } catch {
    return null;
  }
}

function formatBudget(amount: number | null): string {
  if (amount == null) return "--";
  return amount.toLocaleString("th-TH", { style: "currency", currency: "THB" });
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) {
    return (
      <div className="text-center py-16">
        <FolderKanban size={48} className="text-outline/30 mx-auto mb-4" />
        <h3 className="font-bold text-on-surface-variant mb-2">ไม่พบโครงการ</h3>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-primary font-bold text-sm hover:underline"
        >
          <ArrowLeft size={14} />
          กลับไปรายการโครงการ
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-primary font-bold hover:underline"
      >
        <ArrowLeft size={14} />
        โครงการทั้งหมด
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
            {project.name}
          </h1>
          {project.description && (
            <p className="text-on-surface-variant mt-1">{project.description}</p>
          )}
        </div>
        <StatusBadge status={project.status} />
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-primary-fixed rounded-xl flex items-center justify-center">
            <Calendar size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-[10px] text-outline uppercase tracking-wider font-bold">ระยะเวลา</p>
            <p className="text-sm font-bold text-on-surface">
              {formatThaiDate(project.startDate)} - {formatThaiDate(project.endDate)}
            </p>
          </div>
        </div>
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-secondary-fixed rounded-xl flex items-center justify-center">
            <Banknote size={18} className="text-secondary" />
          </div>
          <div>
            <p className="text-[10px] text-outline uppercase tracking-wider font-bold">งบประมาณ</p>
            <p className="text-sm font-bold text-on-surface">
              {formatBudget(project.budgetAmount)}
              {project.budgetYear != null && (
                <span className="text-outline text-xs ml-1">(ปี {project.budgetYear})</span>
              )}
            </p>
          </div>
        </div>
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-tertiary-fixed rounded-xl flex items-center justify-center">
            <FileText size={18} className="text-tertiary" />
          </div>
          <div>
            <p className="text-[10px] text-outline uppercase tracking-wider font-bold">เอกสารที่เกี่ยวข้อง</p>
            <p className="text-sm font-bold text-on-surface">{project.documents.length} รายการ</p>
          </div>
        </div>
      </div>

      {/* Topics */}
      {project.topics.length > 0 && (
        <div>
          <h2 className="text-sm font-black text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
            <Tag size={14} />
            หัวข้อที่เกี่ยวข้อง
          </h2>
          <div className="flex flex-wrap gap-2">
            {project.topics.map((topic) => (
              <span
                key={topic.id}
                className="px-3 py-1 bg-primary-fixed text-primary text-xs font-bold rounded-full"
              >
                {topic.topicName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Linked Documents */}
      <div>
        <h2 className="text-sm font-black text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
          <FileText size={14} />
          เอกสารที่เกี่ยวข้อง
        </h2>
        {project.documents.length === 0 ? (
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-8 text-center text-outline shadow-sm">
            ยังไม่มีเอกสารที่เชื่อมโยง
          </div>
        ) : (
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-surface-low border-b border-outline-variant/10">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">เลขที่</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">เรื่อง</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันที่</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {project.documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-surface-low transition-colors">
                    <td className="px-4 py-3 text-primary font-mono text-xs font-bold">
                      {doc.docNo ?? "--"}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant text-xs">
                      {doc.subject ?? "--"}
                    </td>
                    <td className="px-4 py-3 text-outline text-xs">
                      {formatThaiDate(doc.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
