"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ChevronRight, FileText, Clock, AlertTriangle, CheckCircle, TrendingUp } from "lucide-react";

interface Summary {
  inbound: {
    total: number;
    byStatus: Record<string, number>;
    byUrgency: Record<string, number>;
    overdue: number;
  };
  outbound: {
    total: number;
    byStatus: Record<string, number>;
  };
  registry: { inbound: number; outbound: number };
}

interface MonthData {
  month: number;
  monthName: string;
  inbound: number;
  outbound: number;
  urgent: number;
}

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่", analyzing: "วิเคราะห์", proposed: "เสนอแนะ",
  registered: "ลงรับแล้ว", assigned: "มอบหมายแล้ว",
  in_progress: "กำลังดำเนินการ", completed: "เสร็จสิ้น", archived: "จัดเก็บ",
};

const URGENCY_LABEL: Record<string, string> = {
  normal: "ปกติ", urgent: "ด่วน", very_urgent: "ด่วนที่สุด", most_urgent: "ด่วนที่สุด",
};

const URGENCY_COLOR: Record<string, string> = {
  normal: "bg-outline/20 text-outline",
  urgent: "bg-warning-container text-on-warning-container",
  very_urgent: "bg-secondary-container text-on-secondary-container",
  most_urgent: "bg-error-container text-on-error-container",
};

export default function ReportSummaryPage() {
  const params = useParams();
  const orgId = params.orgId as string;

  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<Summary>(`/reports/${orgId}/summary`),
      apiFetch<MonthData[]>(`/reports/${orgId}/monthly-trend`),
    ])
      .then(([s, t]) => { setSummary(s); setTrend(t); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-center py-16 text-outline">ไม่สามารถโหลดข้อมูลได้</div>
    );
  }

  const maxTrend = Math.max(...trend.map((t) => t.inbound + t.outbound), 1);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-outline">
        <Link href="/organizations" className="hover:text-primary transition-colors">หน่วยงาน</Link>
        <ChevronRight size={14} />
        <Link href={`/organizations/${orgId}`} className="hover:text-primary transition-colors">หน่วยงาน #{orgId}</Link>
        <ChevronRight size={14} />
        <span className="text-on-surface font-medium">รายงานสรุป</span>
      </nav>

      <h1 className="text-2xl font-black text-primary tracking-tight">รายงานสรุปภาพรวม</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: FileText, label: "หนังสือรับทั้งหมด", value: summary.inbound.total, color: "text-primary", bg: "bg-primary/10" },
          { icon: FileText, label: "หนังสือส่งทั้งหมด", value: summary.outbound.total, color: "text-secondary", bg: "bg-secondary/10" },
          { icon: AlertTriangle, label: "งานค้างเกินกำหนด", value: summary.inbound.overdue, color: "text-error", bg: "bg-error/10" },
          { icon: CheckCircle, label: "ทะเบียนรับ/ส่ง", value: summary.registry.inbound + summary.registry.outbound, color: "text-success", bg: "bg-success/10" },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon size={20} className={color} />
            </div>
            <p className={`text-3xl font-black ${color}`}>{value.toLocaleString()}</p>
            <p className="text-xs text-outline mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* By status */}
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
          <h2 className="font-bold text-on-surface mb-4 flex items-center gap-2">
            <Clock size={16} className="text-primary" /> สถานะหนังสือรับ
          </h2>
          <div className="space-y-2.5">
            {Object.entries(summary.inbound.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <span className="text-sm text-on-surface-variant w-36 flex-shrink-0">
                  {STATUS_LABEL[status] ?? status}
                </span>
                <div className="flex-1 bg-surface-low rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full"
                    style={{ width: summary.inbound.total > 0 ? `${(count / summary.inbound.total) * 100}%` : "0%" }}
                  />
                </div>
                <span className="text-sm font-bold text-primary w-8 text-right">{count}</span>
              </div>
            ))}
            {Object.keys(summary.inbound.byStatus).length === 0 && (
              <p className="text-sm text-outline text-center py-4">ไม่มีข้อมูล</p>
            )}
          </div>
        </div>

        {/* By urgency */}
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
          <h2 className="font-bold text-on-surface mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-warning" /> ระดับความเร่งด่วน
          </h2>
          <div className="space-y-2.5">
            {Object.entries(summary.inbound.byUrgency).map(([urgency, count]) => (
              <div key={urgency} className="flex items-center gap-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full w-28 text-center flex-shrink-0 ${URGENCY_COLOR[urgency] ?? "bg-outline/20 text-outline"}`}>
                  {URGENCY_LABEL[urgency] ?? urgency}
                </span>
                <div className="flex-1 bg-surface-low rounded-full h-2">
                  <div
                    className="bg-secondary h-2 rounded-full"
                    style={{ width: summary.inbound.total > 0 ? `${(count / summary.inbound.total) * 100}%` : "0%" }}
                  />
                </div>
                <span className="text-sm font-bold text-secondary w-8 text-right">{count}</span>
              </div>
            ))}
            {Object.keys(summary.inbound.byUrgency).length === 0 && (
              <p className="text-sm text-outline text-center py-4">ไม่มีข้อมูล</p>
            )}
          </div>
        </div>
      </div>

      {/* Monthly trend */}
      <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
        <h2 className="font-bold text-on-surface mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-primary" /> แนวโน้มรายเดือน
        </h2>
        <div className="flex items-end gap-2 h-32">
          {trend.map((t) => (
            <div key={t.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: "96px" }}>
                <div
                  className="w-full bg-primary/70 rounded-t"
                  style={{ height: `${(t.inbound / maxTrend) * 80}px`, minHeight: t.inbound > 0 ? "3px" : "0" }}
                  title={`รับ: ${t.inbound}`}
                />
                <div
                  className="w-full bg-secondary/70 rounded-t"
                  style={{ height: `${(t.outbound / maxTrend) * 80}px`, minHeight: t.outbound > 0 ? "3px" : "0" }}
                  title={`ส่ง: ${t.outbound}`}
                />
              </div>
              <span className="text-[9px] text-outline">{t.monthName}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-outline">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-primary/70 inline-block" />หนังสือรับ</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-secondary/70 inline-block" />หนังสือส่ง</span>
        </div>
      </div>

      {/* Links */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href={`/reports/${orgId}/workload`}
          className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:brightness-110 transition-all"
        >
          ภาระงานรายบุคคล
        </Link>
        <Link
          href={`/reports/${orgId}/audit-trail`}
          className="px-4 py-2 bg-surface-low text-on-surface rounded-xl text-sm font-bold border border-outline-variant/20 hover:border-primary/30 transition-all"
        >
          Audit Trail
        </Link>
      </div>
    </div>
  );
}
