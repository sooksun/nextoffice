"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ChevronRight, User } from "lucide-react";

interface WorkloadItem {
  userId: number;
  fullName: string;
  roleCode: string | null;
  positionTitle: string | null;
  activeCases: number;
}

export default function WorkloadPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const [data, setData] = useState<WorkloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<WorkloadItem[]>(`/reports/${orgId}/workload`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  const max = Math.max(...data.map((d) => d.activeCases), 1);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-outline">
        <Link href={`/reports/${orgId}/summary`} className="hover:text-primary transition-colors">รายงาน</Link>
        <ChevronRight size={14} />
        <span className="text-on-surface font-medium">ภาระงานรายบุคคล</span>
      </nav>

      <h1 className="text-2xl font-black text-primary tracking-tight">ภาระงานรายบุคคล</h1>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center text-outline shadow-sm">
          ไม่มีงานค้างอยู่
        </div>
      ) : (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm divide-y divide-outline-variant/10">
          {data.map((item) => (
            <div key={item.userId} className="flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-on-surface truncate">{item.fullName}</p>
                <p className="text-xs text-outline">{item.positionTitle ?? item.roleCode ?? "-"}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 bg-surface-low rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full"
                      style={{ width: `${(item.activeCases / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-primary">{item.activeCases} งาน</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
