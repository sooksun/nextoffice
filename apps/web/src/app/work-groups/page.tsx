import { apiFetch } from "@/lib/api";
import { Building2, Users, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

const GROUP_COLOR: Record<string, string> = {
  academic: "bg-blue-500/20 text-blue-800 dark:text-blue-300 border-blue-200",
  budget: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-green-200",
  personnel: "bg-purple-500/20 text-purple-800 dark:text-purple-300 border-purple-200",
  general: "bg-orange-500/20 text-orange-800 dark:text-orange-300 border-orange-200",
};
const GROUP_ICON_COLOR: Record<string, string> = {
  academic: "bg-blue-500",
  budget: "bg-green-500",
  personnel: "bg-purple-500",
  general: "bg-orange-500",
};

interface WorkFunction { id: number; code: string; name: string; sortOrder: number }
interface WorkGroup {
  id: number;
  code: string;
  name: string;
  description: string;
  functions: WorkFunction[];
  staffMembers: { id: number; fullName: string; roleCode: string; positionTitle: string | null }[];
}
interface Assignment {
  id: number;
  role: string;
  semester: number;
  user: { id: number; fullName: string; roleCode: string } | null;
  workFunction: { id: number; code: string; name: string; workGroup: { id: number; code: string; name: string } };
  academicYear: { year: number; name: string } | null;
}

async function getData(orgId: string) {
  const [groups, assignments] = await Promise.allSettled([
    apiFetch<WorkGroup[]>(`/work-groups`),
    apiFetch<Assignment[]>(`/work-groups/assignments/my-org`),
  ]);
  return {
    groups: groups.status === "fulfilled" ? (Array.isArray(groups.value) ? groups.value : []) : [],
    assignments: assignments.status === "fulfilled" ? assignments.value : [],
  };
}

export default async function WorkGroupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const orgId = sp.organizationId ?? "1";
  const { groups, assignments } = await getData(orgId);

  // Build a map: workGroupCode → assignments
  const assignmentsByGroup = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const code = a.workFunction.workGroup.code;
    if (!assignmentsByGroup.has(code)) assignmentsByGroup.set(code, []);
    assignmentsByGroup.get(code)!.push(a);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Building2 size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">โครงสร้างองค์กร</h1>
          <p className="text-xs text-on-surface-variant">4 กลุ่มบริหาร ตามกฎกระทรวง พ.ศ. 2550</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-10 text-center text-on-surface-variant">
          ไม่พบข้อมูล — กรุณา POST /work-groups/seed-template ก่อน
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {groups.map((g) => {
            const groupAssignments = assignmentsByGroup.get(g.code) ?? [];
            const uniqueUsers = [...new Map(groupAssignments.map((a) => [a.user?.id, a.user])).values()].filter(Boolean);

            return (
              <div key={g.id} className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden">
                {/* Header */}
                <div className={`px-5 py-4 border-b border-outline-variant/10 flex items-start justify-between`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl ${GROUP_ICON_COLOR[g.code] ?? "bg-primary"} flex items-center justify-center text-white text-xs font-bold`}>
                      {g.name.charAt(2)}
                    </div>
                    <div>
                      <h2 className="font-bold text-sm text-on-surface">{g.name}</h2>
                      <p className="text-xs text-on-surface-variant">{g.description}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-lg border font-semibold ${GROUP_COLOR[g.code] ?? "bg-surface-bright text-on-surface-variant"}`}>
                    {g.functions.length} งาน
                  </span>
                </div>

                {/* Staff */}
                {uniqueUsers.length > 0 && (
                  <div className="px-5 py-3 border-b border-outline-variant/10">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Users size={12} className="text-on-surface-variant" />
                      <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                        บุคลากร ({uniqueUsers.length} คน)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {uniqueUsers.slice(0, 6).map((u) => u && (
                        <div key={u.id} className="flex items-center gap-1.5 bg-surface-bright rounded-xl px-2.5 py-1">
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                            {u.fullName.charAt(0)}
                          </div>
                          <span className="text-xs text-on-surface">{u.fullName}</span>
                        </div>
                      ))}
                      {uniqueUsers.length > 6 && (
                        <span className="text-xs text-on-surface-variant px-2 py-1">+{uniqueUsers.length - 6} คน</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Work functions (collapsed list) */}
                <div className="px-5 py-3">
                  <details>
                    <summary className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide cursor-pointer flex items-center gap-1 select-none">
                      <ChevronRight size={12} />
                      งานย่อย ({g.functions.length} รายการ)
                    </summary>
                    <ul className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
                      {g.functions.map((f) => (
                        <li key={f.id} className="flex items-start gap-2 text-xs py-1">
                          <span className="font-mono text-primary/70 shrink-0 w-10">{f.code}</span>
                          <span className="text-on-surface-variant">{f.name}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
