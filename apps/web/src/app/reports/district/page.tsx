"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Building2, FileText, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface SchoolSummary {
  organizationId: number;
  organizationName: string;
  totalCases: number;
  pendingCases: number;
  completedCases: number;
  overdueCases: number;
  urgentCases: number;
}

interface DistrictSummaryResponse {
  parentOrgId: number;
  schoolCount: number;
  totals: {
    totalCases: number;
    pendingCases: number;
    completedCases: number;
    overdueCases: number;
    urgentCases: number;
  };
  schools: SchoolSummary[];
}

const DISTRICT_ORG_ID = 1;

export default function DistrictReportPage() {
  const [data, setData] = useState<DistrictSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<DistrictSummaryResponse>(`/reports/district/${DISTRICT_ORG_ID}/summary`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!data) {
    return <p className="p-6 text-on-surface-variant">ไม่สามารถโหลดข้อมูลได้</p>;
  }

  const { totals, schools } = data;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
          <Building2 size={24} className="text-primary" />
          รายงานภาพรวมระดับเขต
        </h1>
        <p className="text-on-surface-variant mt-1">
          {data.schoolCount} โรงเรียนในสังกัด
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="เอกสารทั้งหมด" value={totals.totalCases} icon={<FileText size={20} />} color="text-primary" />
        <StatCard label="รอดำเนินการ" value={totals.pendingCases} icon={<Clock size={20} />} color="text-amber-500" />
        <StatCard label="เสร็จแล้ว" value={totals.completedCases} icon={<CheckCircle size={20} />} color="text-green-500" />
        <StatCard label="เกินกำหนด" value={totals.overdueCases} icon={<AlertTriangle size={20} />} color="text-red-500" />
        <StatCard label="ด่วน" value={totals.urgentCases} icon={<AlertTriangle size={20} />} color="text-orange-500" />
      </div>

      {/* Per-school table */}
      <div className="bg-surface-low rounded-2xl overflow-hidden border border-outline-variant/20">
        <div className="px-5 py-4 border-b border-outline-variant/20">
          <h2 className="font-semibold text-on-surface">รายละเอียดรายโรงเรียน</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-on-surface-variant text-xs uppercase tracking-wider">
                <th className="px-5 py-3 text-left">โรงเรียน</th>
                <th className="px-4 py-3 text-right">ทั้งหมด</th>
                <th className="px-4 py-3 text-right">รอดำเนินการ</th>
                <th className="px-4 py-3 text-right">เสร็จแล้ว</th>
                <th className="px-4 py-3 text-right">เกินกำหนด</th>
                <th className="px-4 py-3 text-right">ด่วน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {schools.map((school) => (
                <tr key={school.organizationId} className="hover:bg-surface-bright transition-colors">
                  <td className="px-5 py-3 font-medium text-on-surface">{school.organizationName}</td>
                  <td className="px-4 py-3 text-right text-on-surface">{school.totalCases}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={school.pendingCases > 10 ? "text-amber-500 font-semibold" : "text-on-surface"}>
                      {school.pendingCases}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-green-600">{school.completedCases}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={school.overdueCases > 0 ? "text-red-500 font-semibold" : "text-on-surface-variant"}>
                      {school.overdueCases}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={school.urgentCases > 0 ? "text-orange-500 font-semibold" : "text-on-surface-variant"}>
                      {school.urgentCases}
                    </span>
                  </td>
                </tr>
              ))}
              {schools.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-on-surface-variant">
                    ไม่พบโรงเรียนในสังกัด
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-surface-low rounded-2xl p-4 border border-outline-variant/20">
      <div className={`mb-2 ${color}`}>{icon}</div>
      <p className="text-2xl font-bold text-on-surface">{value.toLocaleString()}</p>
      <p className="text-xs text-on-surface-variant mt-1">{label}</p>
    </div>
  );
}
