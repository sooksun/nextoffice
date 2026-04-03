import { apiFetch } from "@/lib/api";
import Link from "next/link";

interface Organization {
  id: string;
  name: string;
  orgType: string | null;
  province: string | null;
  createdAt: string;
}

async function getOrganizations(): Promise<Organization[]> {
  try {
    return await apiFetch<Organization[]>("/organizations");
  } catch {
    return [];
  }
}

export default async function OrganizationsPage() {
  const orgs = await getOrganizations();

  return (
    <div>
      <h1 className="text-3xl font-black text-primary tracking-tight mb-6">หน่วยงาน</h1>
      {orgs.length === 0 ? (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center text-outline shadow-sm">
          ยังไม่มีหน่วยงาน
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {orgs.map((org) => (
            <Link
              key={org.id}
              href={`/organizations/${org.id}`}
              className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:border-primary/20 hover:shadow-md transition-all shadow-sm"
            >
              <h3 className="font-bold text-on-surface">{org.name}</h3>
              <p className="text-sm text-on-surface-variant mt-1">{org.orgType ?? "ไม่ระบุประเภท"}</p>
              {org.province && <p className="text-xs text-outline mt-0.5">{org.province}</p>}
              <p className="text-[10px] text-outline-variant mt-3 font-medium">
                สร้าง {new Date(org.createdAt).toLocaleDateString("th-TH")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
