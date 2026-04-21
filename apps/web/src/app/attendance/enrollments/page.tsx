"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Search, UserCheck, AlertCircle, Clock, Users } from "lucide-react";

type EnrollItem = {
  userId: number;
  fullName: string;
  email: string;
  roleCode: string;
  positionTitle: string | null;
  department: string | null;
  organization: { id: number; name: string; shortName: string | null };
  profileStatus: "none" | "pending" | "active" | "suspended" | "needs_refresh";
  templateCount: number;
  minRequired: number;
  maxAllowed: number;
  canFinalize: boolean;
  enrolledAt: string | null;
};

type ListResponse = {
  total: number;
  page: number;
  limit: number;
  minRequired: number;
  maxAllowed: number;
  items: EnrollItem[];
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  none: { label: "ยังไม่ลงทะเบียน", color: "bg-slate-100 text-slate-600", icon: <Users size={12} /> },
  pending: { label: "กำลังลงทะเบียน", color: "bg-amber-100 text-amber-700", icon: <Clock size={12} /> },
  active: { label: "พร้อมใช้งาน", color: "bg-emerald-100 text-emerald-700", icon: <UserCheck size={12} /> },
  needs_refresh: { label: "ต้องลงทะเบียนใหม่", color: "bg-orange-100 text-orange-700", icon: <AlertCircle size={12} /> },
  suspended: { label: "ถูกระงับ", color: "bg-red-100 text-red-700", icon: <AlertCircle size={12} /> },
};

const ROLE_TH: Record<string, string> = {
  ADMIN: "ผู้ดูแลระบบ", DIRECTOR: "ผู้อำนวยการ", VICE_DIRECTOR: "รองผู้อำนวยการ",
  HEAD_TEACHER: "หัวหน้างาน", TEACHER: "ครู", CLERK: "เจ้าหน้าที่",
};

export default function EnrollmentsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "30" });
      if (search) params.set("search", search);
      if (filterStatus !== "all") params.set("status", filterStatus);
      const res = await apiFetch<ListResponse>(`/attendance/admin/enrollments?${params}`);
      setData(res);
      setPage(p);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus]);

  useEffect(() => { fetchData(1); }, [search, filterStatus]);

  const stats = data?.items ? {
    total: data.total,
    active: data.items.filter((i) => i.profileStatus === "active").length,
    pending: data.items.filter((i) => i.profileStatus === "pending" || i.profileStatus === "none").length,
    needsRefresh: data.items.filter((i) => i.profileStatus === "needs_refresh").length,
  } : null;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <UserCheck size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-primary">จัดการลงทะเบียนใบหน้า</h1>
          <p className="text-xs text-on-surface-variant">ต้องมี {data?.minRequired ?? 6}–{data?.maxAllowed ?? 10} รูป ต่อ 1 คน</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "ทั้งหมด", value: stats.total, color: "bg-slate-50 text-slate-700" },
            { label: "พร้อมใช้งาน", value: stats.active, color: "bg-emerald-50 text-emerald-700" },
            { label: "รอลงทะเบียน", value: stats.pending, color: "bg-amber-50 text-amber-700" },
            { label: "ต้องอัปเดต", value: stats.needsRefresh, color: "bg-orange-50 text-orange-700" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl p-3 ${s.color}`}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ หรืออีเมล…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">ทุกสถานะ</option>
          <option value="none">ยังไม่ลงทะเบียน</option>
          <option value="pending">กำลังลงทะเบียน</option>
          <option value="active">พร้อมใช้งาน</option>
          <option value="needs_refresh">ต้องอัปเดต</option>
          <option value="suspended">ถูกระงับ</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">กำลังโหลด…</div>
        ) : data?.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">ไม่พบรายการ</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">ชื่อ-สกุล</th>
                <th className="px-4 py-3 text-left font-medium">ตำแหน่ง / หน่วยงาน</th>
                <th className="px-4 py-3 text-center font-medium">รูปภาพ</th>
                <th className="px-4 py-3 text-center font-medium">สถานะ</th>
                <th className="px-4 py-3 text-center font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data?.items.map((item) => {
                const cfg = STATUS_CONFIG[item.profileStatus] ?? STATUS_CONFIG.none;
                const progress = Math.min(100, Math.round((item.templateCount / item.minRequired) * 100));
                return (
                  <tr key={item.userId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{item.fullName}</div>
                      <div className="text-xs text-slate-400">{item.email}</div>
                      <div className="text-xs text-slate-500">{ROLE_TH[item.roleCode] ?? item.roleCode}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div>{item.positionTitle ?? "-"}</div>
                      <div className="text-slate-400">{item.organization?.shortName ?? item.organization?.name}</div>
                      {item.department && <div className="text-slate-400">{item.department}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <div className="text-sm font-semibold text-slate-700">
                          {item.templateCount} <span className="text-xs font-normal text-slate-400">/ {item.maxAllowed}</span>
                        </div>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${item.profileStatus === "active" ? "bg-emerald-500" : "bg-amber-400"}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-slate-400">ขั้นต่ำ {item.minRequired}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.color}`}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                      {item.enrolledAt && (
                        <div className="mt-1 text-[10px] text-slate-400">
                          {new Date(item.enrolledAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/attendance/enrollments/${item.userId}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        จัดการรูป →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > data.limit && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: Math.ceil(data.total / data.limit) }, (_, i) => (
            <button
              key={i}
              onClick={() => fetchData(i + 1)}
              className={`rounded px-3 py-1 text-sm ${page === i + 1 ? "bg-primary text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
