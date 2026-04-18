import { apiFetch } from "@/lib/api";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface SnapshotData {
  date: string;
  totalInbound: number;
  urgentCount: number;
  pendingCount: number;
  overdueCount: number;
  recentItems: Array<{
    id: number;
    title: string;
    urgency: string;
    status: string;
    createdAt: string;
  }>;
}

async function getSnapshot(orgId: string) {
  try {
    return await apiFetch<SnapshotData>(`/reports/${orgId}/executive-snapshot`);
  } catch {
    return null;
  }
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className={`rounded-lg p-4 ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm font-medium text-on-surface-variant">{label}</span>
      </div>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}

function urgencyBadge(urgency: string) {
  const colors: Record<string, string> = {
    normal: "bg-surface-mid text-on-surface-variant",
    urgent: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
    very_urgent: "bg-orange-500/20 text-orange-800 dark:text-orange-300",
    most_urgent: "bg-red-500/20 text-red-800 dark:text-red-300",
  };
  const labels: Record<string, string> = {
    normal: "ปกติ",
    urgent: "ด่วน",
    very_urgent: "ด่วนที่สุด",
    most_urgent: "ด่วนที่สุด",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[urgency] || "bg-surface-mid"}`}>
      {labels[urgency] || urgency}
    </span>
  );
}

export default async function ExecutiveSnapshotPage(props: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await props.params;
  const data = await getSnapshot(orgId);

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center text-on-surface-variant">
        <p>ไม่สามารถโหลดข้อมูลได้</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <Link href={`/reports/${orgId}`} className="text-sm text-blue-600 hover:underline mb-1 block">
          &larr; กลับหน้ารายงาน
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Executive Snapshot</h1>
        <p className="text-sm text-on-surface-variant">สรุปภาพรวมประจำวัน {data.date}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="หนังสือเข้าวันนี้" value={data.totalInbound} icon="📥" color="bg-blue-50" />
        <StatCard label="เรื่องด่วน" value={data.urgentCount} icon="🔴" color="bg-red-50" />
        <StatCard label="รอดำเนินการ" value={data.pendingCount} icon="⏳" color="bg-yellow-50" />
        <StatCard label="เกินกำหนด" value={data.overdueCount} icon="⚠️" color="bg-orange-50" />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">เรื่องล่าสุด</h2>
        {data.recentItems.length === 0 ? (
          <p className="text-on-surface-variant">ไม่มีเรื่องในวันนี้</p>
        ) : (
          <div className="space-y-2">
            {data.recentItems.map((item) => (
              <Link
                key={item.id}
                href={`/cases/${item.id}`}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-surface-low transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                  <p className="text-xs text-on-surface-variant">
                    {new Date(item.createdAt).toLocaleString("th-TH")}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {urgencyBadge(item.urgency)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
