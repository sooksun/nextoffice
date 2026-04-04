import { apiFetch } from "@/lib/api";
import { BookOpen, Lightbulb, Database, Plus, Shield, TrendingUp } from "lucide-react";
import Link from "next/link";

interface PolicyItem {
  type: "policy";
  id: number;
  title: string;
  summary: string;
  mandatoryLevel: string;
  issuingAuthority: string;
  clauseCount: number;
}

interface HorizonItem {
  type: "horizon";
  id: number;
  title: string;
  summary: string;
  evidenceStrength: string;
  practiceCount: number;
}

interface KnowledgeData {
  policies: PolicyItem[];
  horizons: HorizonItem[];
  total: number;
}

async function getData(): Promise<KnowledgeData> {
  try {
    return await apiFetch<KnowledgeData>("/knowledge");
  } catch {
    return { policies: [], horizons: [], total: 0 };
  }
}

export default async function KnowledgePage() {
  const data = await getData();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
            ฐานข้อมูลความรู้
          </h1>
          <p className="text-on-surface-variant mt-1">
            จัดการข้อมูลระเบียบ นโยบาย และแนวปฏิบัติสำหรับระบบ AI สารบรรณ
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-primary-fixed rounded-2xl flex items-center justify-center">
            <Database size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-2xl font-black text-primary">{data.total}</p>
            <p className="text-xs text-on-surface-variant font-medium">ข้อมูลทั้งหมด</p>
          </div>
        </div>
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-secondary-fixed rounded-2xl flex items-center justify-center">
            <Shield size={20} className="text-secondary" />
          </div>
          <div>
            <p className="text-2xl font-black text-secondary">{data.policies.length}</p>
            <p className="text-xs text-on-surface-variant font-medium">ระเบียบ/นโยบาย</p>
          </div>
        </div>
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-tertiary-fixed rounded-2xl flex items-center justify-center">
            <TrendingUp size={20} className="text-tertiary" />
          </div>
          <div>
            <p className="text-2xl font-black text-tertiary">{data.horizons.length}</p>
            <p className="text-xs text-on-surface-variant font-medium">แนวปฏิบัติ/นวัตกรรม</p>
          </div>
        </div>
      </div>

      {/* Policy Items */}
      {data.policies.length > 0 && (
        <div>
          <h2 className="text-sm font-black text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
            <BookOpen size={14} />
            ระเบียบ / นโยบาย
          </h2>
          <div className="space-y-3">
            {data.policies.map((item) => (
              <div
                key={item.id}
                className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-on-surface">{item.title}</h3>
                    <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">
                      {item.summary}
                    </p>
                    <div className="flex items-center gap-3 mt-3">
                      <span className="px-2 py-0.5 bg-secondary-fixed text-secondary text-[10px] font-bold rounded-full uppercase">
                        {item.mandatoryLevel}
                      </span>
                      <span className="text-[11px] text-outline">
                        {item.issuingAuthority}
                      </span>
                      <span className="text-[11px] text-outline">
                        {item.clauseCount} มาตรา/ข้อ
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
            แนวปฏิบัติ / นวัตกรรม
          </h2>
          <div className="space-y-3">
            {data.horizons.map((item) => (
              <div
                key={item.id}
                className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:shadow-md transition-shadow"
              >
                <h3 className="font-bold text-on-surface">{item.title}</h3>
                <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">
                  {item.summary}
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <span className="px-2 py-0.5 bg-tertiary-fixed text-tertiary text-[10px] font-bold rounded-full uppercase">
                    {item.evidenceStrength}
                  </span>
                  <span className="text-[11px] text-outline">
                    {item.practiceCount} แนวปฏิบัติ
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.total === 0 && (
        <div className="text-center py-16">
          <Database size={48} className="text-outline/30 mx-auto mb-4" />
          <h3 className="font-bold text-on-surface-variant mb-2">ยังไม่มีข้อมูลในระบบ</h3>
          <p className="text-sm text-outline mb-4">
            เพิ่มระเบียบสารบรรณหรือแนวปฏิบัติเพื่อให้ AI สามารถตอบคำถามได้
          </p>
          <Link
            href="/knowledge/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-2xl font-bold text-sm"
          >
            <Plus size={16} />
            เพิ่มข้อมูลแรก
          </Link>
        </div>
      )}
    </div>
  );
}
