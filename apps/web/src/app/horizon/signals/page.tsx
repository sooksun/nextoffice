import { apiFetch } from "@/lib/api";
import { Radar, Database } from "lucide-react";
import { formatThaiDateShort } from "@/lib/thai-date";

export const dynamic = "force-dynamic";

interface Signal {
  id: number;
  signalTitle: string;
  signalType: string;
  actionabilityLevel: string;
  targetEntities: string | null;
  detectedAt: string | null;
}

async function getSignals(): Promise<Signal[]> {
  try {
    const res = await apiFetch<{ total: number; data: Signal[] }>("/horizon/signals");
    return res.data ?? [];
  } catch {
    return [];
  }
}

function ActionabilityBadge({ level }: { level: string }) {
  const colorMap: Record<string, string> = {
    high: "bg-error-container text-on-error-container",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${colorMap[level] ?? "bg-surface-high text-on-surface-variant"}`}
    >
      {level}
    </span>
  );
}

export default async function HorizonSignalsPage() {
  const signals = await getSignals();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
          สัญญาณการเปลี่ยนแปลง
        </h1>
        <p className="text-on-surface-variant mt-1">
          รายการสัญญาณจากระบบ Horizon Scanning
        </p>
      </div>

      {/* Table */}
      {signals.length === 0 ? (
        <div className="text-center py-16">
          <Database size={48} className="text-outline/30 mx-auto mb-4" />
          <h3 className="font-bold text-on-surface-variant mb-2">ยังไม่มีสัญญาณ</h3>
          <p className="text-sm text-outline">ระบบจะตรวจจับสัญญาณเมื่อมีข้อมูลจากแหล่งข้อมูล Horizon</p>
        </div>
      ) : (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-low border-b border-outline-variant/10">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">สัญญาณ</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ประเภท</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ระดับ</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">หน่วยงานเป้าหมาย</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ตรวจพบ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {signals.map((signal) => (
                <tr key={signal.id} className="hover:bg-surface-low transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Radar size={14} className="text-secondary shrink-0" />
                      <span className="font-medium text-on-surface">{signal.signalTitle}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs">{signal.signalType}</td>
                  <td className="px-4 py-3">
                    <ActionabilityBadge level={signal.actionabilityLevel} />
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs max-w-xs truncate">
                    {signal.targetEntities ?? "--"}
                  </td>
                  <td className="px-4 py-3 text-outline text-xs">
                    {formatThaiDateShort(signal.detectedAt)}
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
