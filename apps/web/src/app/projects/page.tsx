"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { formatThaiDateShort } from "@/lib/thai-date";
import StatusBadge from "@/components/StatusBadge";
import { FolderKanban, Database, Loader2 } from "lucide-react";

interface Project {
  id: number;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budgetAmount: number | null;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      // organizationId comes from the logged-in user's context;
      // the API returns projects scoped to the user's org when no param is given
      const data = await apiFetch<Project[]>("/projects");
      setProjects(data);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  function formatBudget(amount: number | null): string {
    if (amount == null) return "--";
    return amount.toLocaleString("th-TH", { style: "currency", currency: "THB" });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
          โครงการ
        </h1>
        <p className="text-on-surface-variant mt-1">
          รายการโครงการทั้งหมดในหน่วยงาน
        </p>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16">
          <Database size={48} className="text-outline/30 mx-auto mb-4" />
          <h3 className="font-bold text-on-surface-variant mb-2">ยังไม่มีโครงการ</h3>
          <p className="text-sm text-outline">โครงการจะถูกสร้างเมื่อมีการเชื่อมโยงจากเอกสารที่เข้ามา</p>
        </div>
      ) : (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-low border-b border-outline-variant/10">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ชื่อโครงการ</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สถานะ</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันเริ่ม</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันสิ้นสุด</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">งบประมาณ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {projects.map((project) => (
                <tr key={project.id} className="hover:bg-surface-low transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex items-center gap-2 text-primary hover:text-secondary font-bold"
                    >
                      <FolderKanban size={14} />
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="px-4 py-3 text-outline text-xs">
                    {formatThaiDateShort(project.startDate)}
                  </td>
                  <td className="px-4 py-3 text-outline text-xs">
                    {formatThaiDateShort(project.endDate)}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs font-mono">
                    {formatBudget(project.budgetAmount)}
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
