import { apiFetch } from "@/lib/api";
import { BookOpen, Lightbulb, Database, Plus, Shield, TrendingUp, FileText } from "lucide-react";
import Link from "next/link";
import SeedPanel from "@/components/knowledge/SeedPanel";

export const dynamic = "force-dynamic";

const MANDATORY_LABEL: Record<string, string> = {
  mandatory: "บังคับ", recommended: "แนะนำ", optional: "ทางเลือก",
  strategic: "ยุทธศาสตร์", entitlement: "สิทธิ์",
};
const MANDATORY_COLOR: Record<string, string> = {
  mandatory: "bg-red-500/20 text-red-800 dark:text-red-300",
  recommended: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  optional: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300",
  strategic: "bg-blue-500/20 text-blue-800 dark:text-blue-300",
  entitlement: "bg-purple-500/20 text-purple-800 dark:text-purple-300",
};

interface PolicyItem {
  type: "policy"; id: number; title: string; summary: string;
  mandatoryLevel: string; issuingAuthority: string; clauseCount: number;
}
interface HorizonItem {
  type: "horizon"; id: number; title: string; summary: string;
  evidenceStrength: string; practiceCount: number;
}
interface KnowledgeData { policies: PolicyItem[]; horizons: HorizonItem[]; total: number; }
interface Stats { policyCount: number; clauseCount: number; horizonSourceCount: number; horizonDocCount: number; }

async function getData(): Promise<KnowledgeData> {
  try { return await apiFetch<KnowledgeData>("/knowledge"); }
  catch { return { policies: [], horizons: [], total: 0 }; }
}
async function getStats(): Promise<Stats> {
  try { return await apiFetch<Stats>("/knowledge/stats"); }
  catch { return { policyCount: 0, clauseCount: 0, horizonSourceCount: 0, horizonDocCount: 0 }; }
}

export default async function KnowledgePage() {
  const [data, stats] = await Promise.all([getData(), getStats()]);
  const needsSeed = stats.policyCount === 0 || stats.horizonSourceCount === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
            ฐานข้อมูลความรู้
          </h1>
          <p className="text-on-surface-variant mt-1">
            นโยบาย สพฐ. และแนวปฏิบัติสำหรับระบบ AI เสนอแนะแนวทางดำเนินงาน
          </p>
        </div>
        <Link
          href="/knowledge/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-2xl font-bold text-sm shadow-md shadow-primary/20 hover:brightness-110 transition-all"
        >
          <Plus size={16} />
          เพิ่มข้อมูล
        </Link>
      </div>

      {/* Seed Panel — แสดงเสมอ เพื่อดู stats */}
      <SeedPanel stats={stats} />

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-primary-fixed rounded-2xl flex items-center justify-center">
            <Database size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-2xl font-black text-primary">{data.total}</p>
            <p className="text-xs text-on-surface-variant font-medium">รายการทั้งหมด</p>
          </div>
        </div>
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-secondary-fixed rounded-2xl flex items-center justify-center">
            <Shield size={20} className="text-secondary" />
          </div>
          <div>
            <p className="text-2xl font-black text-secondary">{stats.policyCount}</p>
            <p className="text-xs text-on-surface-variant font-medium">
              นโยบาย ({stats.clauseCount} มาตรา)
            </p>
          </div>
        </div>
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-tertiary-fixed rounded-2xl flex items-center justify-center">
            <TrendingUp size={20} className="text-tertiary" />
          </div>
          <div>
            <p className="text-2xl font-black text-tertiary">{stats.horizonSourceCount}</p>
            <p className="text-xs text-on-surface-variant font-medium">
              แหล่ง Horizon ({stats.horizonDocCount} เอกสาร)
            </p>
          </div>
        </div>
      </div>

      {/* Policy Items */}
      {data.policies.length > 0 && (
        <div>
          <h2 className="text-sm font-black text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
            <BookOpen size={14} />
            นโยบาย / ระเบียบ สพฐ. ({data.policies.length})
          </h2>
          <div className="space-y-3">
            {data.policies.map((item) => (
              <div key={item.id} className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-on-surface leading-snug">{item.title}</h3>
                    <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">{item.summary}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${MANDATORY_COLOR[item.mandatoryLevel] ?? "bg-surface-high text-outline"}`}>
                        {MANDATORY_LABEL[item.mandatoryLevel] ?? item.mandatoryLevel}
                      </span>
                      <span className="text-[11px] text-outline">{item.issuingAuthority}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-outline">
                        <FileText size={10} /> {item.clauseCount} มาตรา
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Horizon Items */}
      {data.horizons.length > 0 && (
        <div>
          <h2 className="text-sm font-black text-tertiary uppercase tracking-wider mb-3 flex items-center gap-2">
            <Lightbulb size={14} />
            แนวปฏิบัติ / นวัตกรรม ({data.horizons.length})
          </h2>
          <div className="space-y-3">
            {data.horizons.map((item) => (
              <div key={item.id} className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:shadow-md transition-shadow">
                <h3 className="font-bold text-on-surface">{item.title}</h3>
                <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">{item.summary}</p>
                <div className="flex items-center gap-3 mt-3">
                  <span className="px-2 py-0.5 bg-tertiary-fixed text-tertiary text-[10px] font-bold rounded-full uppercase">
                    {item.evidenceStrength}
                  </span>
                  <span className="text-[11px] text-outline">{item.practiceCount} แนวปฏิบัติ</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for lists */}
      {data.total === 0 && !needsSeed && (
        <div className="text-center py-12">
          <Database size={48} className="text-outline/30 mx-auto mb-4" />
          <h3 className="font-bold text-on-surface-variant mb-2">ยังไม่มีข้อมูล</h3>
          <Link href="/knowledge/new" className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-2xl font-bold text-sm mt-2">
            <Plus size={16} /> เพิ่มข้อมูลแรก
          </Link>
        </div>
      )}
    </div>
  );
}
