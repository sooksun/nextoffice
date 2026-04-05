import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Users, FileText, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

interface Organization {
  id: number;
  name: string;
  orgType: string | null;
  province: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  isActive: boolean;
  createdAt: string;
  profiles?: { profileYear: number; studentCount: number | null; teacherCount: number | null }[];
  contextScores?: { id: number; dimension: { name: string }; score: number }[];
}

async function getOrganization(id: string): Promise<Organization | null> {
  try {
    return await apiFetch<Organization>(`/organizations/${id}`);
  } catch {
    return null;
  }
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await getOrganization(id);
  if (!org) notFound();

  const profile = org.profiles?.[0] ?? null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-outline">
        <Link href="/organizations" className="hover:text-primary transition-colors">
          หน่วยงาน
        </Link>
        <ChevronRight size={14} />
        <span className="text-on-surface font-medium">{org.name}</span>
      </nav>

      {/* Header */}
      <div className="bg-surface-lowest rounded-3xl border border-outline-variant/10 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 size={28} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black text-primary tracking-tight">{org.name}</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {org.orgType ?? "ไม่ระบุประเภท"}
              {org.province && ` · ${org.province}`}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              org.isActive
                ? "bg-success-container text-on-success-container"
                : "bg-error-container text-on-error-container"
            }`}
          >
            {org.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
          </span>
        </div>

        {/* Info grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {org.address && (
            <div>
              <span className="text-outline text-xs font-bold uppercase tracking-wider">ที่อยู่</span>
              <p className="text-on-surface mt-0.5">{org.address}</p>
            </div>
          )}
          {org.phone && (
            <div>
              <span className="text-outline text-xs font-bold uppercase tracking-wider">โทรศัพท์</span>
              <p className="text-on-surface mt-0.5">{org.phone}</p>
            </div>
          )}
          {org.email && (
            <div>
              <span className="text-outline text-xs font-bold uppercase tracking-wider">อีเมล</span>
              <p className="text-on-surface mt-0.5">{org.email}</p>
            </div>
          )}
          {org.website && (
            <div>
              <span className="text-outline text-xs font-bold uppercase tracking-wider">เว็บไซต์</span>
              <a href={org.website} target="_blank" rel="noreferrer" className="text-primary mt-0.5 block hover:underline">
                {org.website}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      {profile && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-primary" />
              <span className="text-xs font-bold text-outline uppercase tracking-wider">นักเรียน</span>
            </div>
            <p className="text-3xl font-black text-primary">
              {profile.studentCount?.toLocaleString() ?? "-"}
            </p>
            <p className="text-xs text-outline mt-1">ปีการศึกษา {profile.profileYear}</p>
          </div>
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-secondary" />
              <span className="text-xs font-bold text-outline uppercase tracking-wider">ครู/บุคลากร</span>
            </div>
            <p className="text-3xl font-black text-secondary">
              {profile.teacherCount?.toLocaleString() ?? "-"}
            </p>
            <p className="text-xs text-outline mt-1">ปีการศึกษา {profile.profileYear}</p>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href={`/cases?organizationId=${org.id}`}
          className="flex items-center gap-3 bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5 hover:border-primary/20 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText size={20} className="text-primary" />
          </div>
          <div>
            <p className="font-bold text-on-surface">หนังสือรับ</p>
            <p className="text-xs text-outline">ดูทะเบียนหนังสือของหน่วยงาน</p>
          </div>
          <ChevronRight size={16} className="text-outline ml-auto" />
        </Link>

        <Link
          href={`/reports/${org.id}/summary`}
          className="flex items-center gap-3 bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5 hover:border-primary/20 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
            <FileText size={20} className="text-secondary" />
          </div>
          <div>
            <p className="font-bold text-on-surface">รายงาน</p>
            <p className="text-xs text-outline">สรุปภาพรวมและสถิติ</p>
          </div>
          <ChevronRight size={16} className="text-outline ml-auto" />
        </Link>
      </div>

      {/* Context scores */}
      {org.contextScores && org.contextScores.length > 0 && (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
          <h2 className="font-bold text-on-surface mb-4">คะแนนบริบทองค์กร</h2>
          <div className="space-y-3">
            {org.contextScores.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="text-sm text-on-surface-variant w-40 flex-shrink-0">
                  {s.dimension.name}
                </span>
                <div className="flex-1 bg-surface-low rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(s.score, 100)}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-primary w-10 text-right">{s.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
