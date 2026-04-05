"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ChevronRight } from "lucide-react";

interface AuditItem {
  id: number;
  action: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
  user: { id: number; fullName: string; roleCode: string } | null;
  case: { id: number; title: string; registrationNo: string | null } | null;
}

const ACTION_LABEL: Record<string, string> = {
  register: "ลงรับ",
  assign: "มอบหมาย",
  routing_applied: "Smart Routing",
  update_status: "เปลี่ยนสถานะ",
  complete: "เสร็จสิ้น",
  auto_complete: "เสร็จอัตโนมัติ",
};

const ACTION_COLOR: Record<string, string> = {
  register: "bg-primary/10 text-primary",
  assign: "bg-secondary/10 text-secondary",
  routing_applied: "bg-tertiary/10 text-tertiary",
  update_status: "bg-outline/10 text-outline",
  complete: "bg-success/10 text-success",
  auto_complete: "bg-success/10 text-success",
};

export default function AuditTrailPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const [data, setData] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<AuditItem[]>(`/reports/${orgId}/audit-trail?take=50`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-outline">
        <Link href={`/reports/${orgId}/summary`} className="hover:text-primary transition-colors">รายงาน</Link>
        <ChevronRight size={14} />
        <span className="text-on-surface font-medium">Audit Trail</span>
      </nav>

      <h1 className="text-2xl font-black text-primary tracking-tight">Audit Trail</h1>
      <p className="text-sm text-outline -mt-4">ประวัติการดำเนินงานทั้งหมด (50 รายการล่าสุด)</p>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center text-outline shadow-sm">
          ไม่มีข้อมูล
        </div>
      ) : (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm divide-y divide-outline-variant/10">
          {data.map((item) => (
            <div key={item.id} className="p-4 flex items-start gap-3">
              <span className={`mt-0.5 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${ACTION_COLOR[item.action] ?? "bg-outline/10 text-outline"}`}>
                {ACTION_LABEL[item.action] ?? item.action}
              </span>
              <div className="flex-1 min-w-0">
                {item.case && (
                  <p className="text-sm font-medium text-on-surface truncate">
                    {item.case.registrationNo && (
                      <span className="text-primary font-bold mr-1">{item.case.registrationNo}</span>
                    )}
                    {item.case.title}
                  </p>
                )}
                {item.user && (
                  <p className="text-xs text-outline mt-0.5">
                    โดย {item.user.fullName} · {item.user.roleCode}
                  </p>
                )}
              </div>
              <time className="text-xs text-outline flex-shrink-0">
                {new Date(item.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
              </time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
