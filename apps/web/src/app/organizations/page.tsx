import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { Network, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

interface OrgItem {
  id: number;
  name: string;
  orgType: string | null;
  province: string | null;
  district: string | null;
  areaCode: string | null;
  parentOrganization: { id: number; name: string; areaCode?: string | null } | null;
  activeAcademicYear: { year: number; name: string } | null;
  isActive: boolean;
}

const ORG_TYPE_LABELS: Record<string, string> = {
  school: "โรงเรียน",
  area_office: "สำนักงานเขตพื้นที่ฯ",
  central_office: "สำนักงานกลาง",
};

async function getOrganizations(): Promise<OrgItem[]> {
  try {
    return await apiFetch<OrgItem[]>("/organizations");
  } catch {
    return [];
  }
}

export default async function OrganizationsPage() {
  const orgs = await getOrganizations();

  // Group by type
  const areaOffices = orgs.filter((o) => o.orgType === "area_office");
  const schools = orgs.filter((o) => o.orgType === "school" || !o.orgType);
  const others = orgs.filter((o) => o.orgType && o.orgType !== "area_office" && o.orgType !== "school");

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-black text-primary tracking-tight">หน่วยงาน</h1>

      {orgs.length === 0 && (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center text-outline shadow-sm">
          ยังไม่มีหน่วยงาน
        </div>
      )}

      {areaOffices.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-outline uppercase tracking-wider mb-3">สำนักงานเขตพื้นที่การศึกษา</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {areaOffices.map((org) => <OrgCard key={org.id} org={org} />)}
          </div>
        </section>
      )}

      {schools.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-outline uppercase tracking-wider mb-3">โรงเรียน</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {schools.map((org) => <OrgCard key={org.id} org={org} />)}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-outline uppercase tracking-wider mb-3">อื่นๆ</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {others.map((org) => <OrgCard key={org.id} org={org} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function OrgCard({ org }: { org: OrgItem }) {
  const educationArea = org.areaCode ?? org.parentOrganization?.areaCode ?? org.parentOrganization?.name;
  return (
    <Link
      href={`/organizations/${org.id}`}
      className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:border-primary/20 hover:shadow-md transition-all shadow-sm flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-on-surface leading-tight">{org.name}</h3>
        <span className="text-[10px] px-2 py-0.5 bg-surface-low rounded-full text-outline font-medium shrink-0">
          {ORG_TYPE_LABELS[org.orgType ?? ""] ?? org.orgType ?? "—"}
        </span>
      </div>

      {educationArea && (
        <p className="text-xs text-on-surface-variant flex items-center gap-1">
          <Network size={11} className="text-outline" />
          {educationArea}
        </p>
      )}

      {(org.province || org.district) && (
        <p className="text-xs text-outline">
          {[org.province, org.district].filter(Boolean).join(" · ")}
        </p>
      )}

      {org.activeAcademicYear && (
        <p className="text-xs text-primary font-medium flex items-center gap-1 mt-auto">
          <Calendar size={11} />
          {org.activeAcademicYear.name}
        </p>
      )}
    </Link>
  );
}
