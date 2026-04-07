"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2, Users, FileText, ChevronRight, Edit2, Save, X,
  MapPin, Phone, Mail, Globe, Calendar, Network,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getUser } from "@/lib/auth";

interface AcademicYear { id: number; year: number; name: string; isCurrent?: boolean; }
interface OrgRef { id: number; name: string; areaCode?: string | null; orgType?: string | null; }

interface Organization {
  id: number;
  name: string;
  shortName: string | null;
  orgCode: string | null;
  orgType: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  areaCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  parentOrganizationId: number | null;
  parentOrganization: OrgRef | null;
  activeAcademicYearId: number | null;
  activeAcademicYear: AcademicYear | null;
  isActive: boolean;
  createdAt: string;
  profiles?: { profileYear: number; studentCount: number | null; teacherCount: number | null }[];
  contextScores?: { id: number; dimension: { name: string }; score: number }[];
  childOrganizations?: OrgRef[];
}

const ORG_TYPE_LABELS: Record<string, string> = {
  school: "โรงเรียน",
  area_office: "สำนักงานเขตพื้นที่การศึกษา",
  central_office: "สำนักงานกลาง",
};

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const currentUser = getUser();
  const isAdmin = currentUser?.roleCode === "ADMIN";

  const [org, setOrg] = useState<Organization | null>(null);
  const [allYears, setAllYears] = useState<AcademicYear[]>([]);
  const [allOrgs, setAllOrgs] = useState<OrgRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "", shortName: "", orgCode: "", orgType: "school",
    address: "", province: "", district: "", areaCode: "",
    phone: "", email: "", website: "",
    parentOrganizationId: "" as string | number,
    activeYearId: "" as string | number,
  });

  useEffect(() => {
    async function load() {
      try {
        const [o, years, orgs] = await Promise.all([
          apiFetch<Organization>(`/organizations/${id}`),
          apiFetch<AcademicYear[]>("/academic-years"),
          apiFetch<OrgRef[]>("/organizations"),
        ]);
        setOrg(o);
        setAllYears(years);
        setAllOrgs(orgs.filter((x) => x.id !== o.id));
        resetForm(o);
      } catch {
        router.push("/organizations");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  function resetForm(o: Organization) {
    setForm({
      name: o.name ?? "",
      shortName: o.shortName ?? "",
      orgCode: o.orgCode ?? "",
      orgType: o.orgType ?? "school",
      address: o.address ?? "",
      province: o.province ?? "",
      district: o.district ?? "",
      areaCode: o.areaCode ?? "",
      phone: o.phone ?? "",
      email: o.email ?? "",
      website: o.website ?? "",
      parentOrganizationId: o.parentOrganizationId ?? "",
      activeYearId: o.activeAcademicYearId ?? "",
    });
  }

  async function handleSave() {
    if (!org) return;
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        shortName: form.shortName || null,
        orgCode: form.orgCode || null,
        orgType: form.orgType,
        address: form.address || null,
        province: form.province || null,
        district: form.district || null,
        areaCode: form.areaCode || null,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        parentOrganizationId: form.parentOrganizationId ? Number(form.parentOrganizationId) : null,
      };
      await apiFetch<Organization>(`/organizations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      // Set active year separately if changed
      if (form.activeYearId && Number(form.activeYearId) !== org.activeAcademicYearId) {
        await apiFetch(`/organizations/${id}/active-year`, {
          method: "POST",
          body: JSON.stringify({ academicYearId: Number(form.activeYearId) }),
        });
      }
      // Reload
      const fresh = await apiFetch<Organization>(`/organizations/${id}`);
      setOrg(fresh);
      setEditing(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
      setError(msg.replace(/^API \d+: /, ""));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-12 text-center text-outline">กำลังโหลด...</div>;
  }
  if (!org) return null;

  const profile = org.profiles?.[0] ?? null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-outline">
        <Link href="/organizations" className="hover:text-primary transition-colors">หน่วยงาน</Link>
        <ChevronRight size={14} />
        <span className="text-on-surface font-medium">{org.name}</span>
      </nav>

      {/* Header card */}
      <div className="bg-surface-lowest rounded-3xl border border-outline-variant/10 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 size={28} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full text-2xl font-black text-primary bg-surface-low border border-primary/30 rounded-xl px-3 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            ) : (
              <h1 className="text-2xl font-black text-primary tracking-tight">{org.name}</h1>
            )}
            <p className="text-sm text-on-surface-variant mt-0.5">
              {ORG_TYPE_LABELS[org.orgType ?? ""] ?? org.orgType ?? "ไม่ระบุประเภท"}
              {org.province && ` · ${org.province}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${org.isActive ? "bg-success-container text-on-success-container" : "bg-error-container text-on-error-container"}`}>
              {org.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
            </span>
            {isAdmin && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="p-2 text-outline hover:text-primary hover:bg-primary/5 rounded-xl transition-colors"
                title="แก้ไข"
              >
                <Edit2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Key info row */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Education area */}
          <div>
            <span className="text-xs text-outline font-bold uppercase tracking-wider flex items-center gap-1">
              <Network size={11} /> เขตพื้นที่การศึกษา
            </span>
            {editing ? (
              <input
                value={form.areaCode}
                onChange={(e) => setForm((f) => ({ ...f, areaCode: e.target.value }))}
                placeholder="เช่น สพป.เชียงราย เขต 3"
                className="mt-1 w-full text-sm bg-surface-low border border-outline-variant/30 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            ) : (
              <p className="text-sm text-on-surface mt-0.5">
                {org.areaCode ?? org.parentOrganization?.areaCode ?? org.parentOrganization?.name ?? "—"}
              </p>
            )}
          </div>

          {/* Parent org */}
          <div>
            <span className="text-xs text-outline font-bold uppercase tracking-wider flex items-center gap-1">
              <Building2 size={11} /> สังกัด (org แม่)
            </span>
            {editing ? (
              <select
                value={form.parentOrganizationId}
                onChange={(e) => setForm((f) => ({ ...f, parentOrganizationId: e.target.value }))}
                className="mt-1 w-full text-sm bg-surface-low border border-outline-variant/30 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">— ไม่มี —</option>
                {allOrgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-on-surface mt-0.5">
                {org.parentOrganization ? (
                  <Link href={`/organizations/${org.parentOrganization.id}`} className="text-primary hover:underline">
                    {org.parentOrganization.name}
                  </Link>
                ) : "—"}
              </p>
            )}
          </div>

          {/* Active academic year */}
          <div>
            <span className="text-xs text-outline font-bold uppercase tracking-wider flex items-center gap-1">
              <Calendar size={11} /> ปีสารบรรณที่ใช้งาน
            </span>
            {editing ? (
              <select
                value={form.activeYearId}
                onChange={(e) => setForm((f) => ({ ...f, activeYearId: e.target.value }))}
                className="mt-1 w-full text-sm bg-surface-low border border-outline-variant/30 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">— ยังไม่กำหนด —</option>
                {allYears.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? " (ปัจจุบัน)" : ""}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-on-surface mt-0.5">
                {org.activeAcademicYear ? (
                  <span className="font-semibold text-primary">{org.activeAcademicYear.name}</span>
                ) : "—"}
              </p>
            )}
          </div>

          {/* Province / district */}
          <div>
            <span className="text-xs text-outline font-bold uppercase tracking-wider flex items-center gap-1">
              <MapPin size={11} /> จังหวัด / อำเภอ
            </span>
            {editing ? (
              <div className="flex gap-2 mt-1">
                <input
                  value={form.province}
                  onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                  placeholder="จังหวัด"
                  className="flex-1 text-sm bg-surface-low border border-outline-variant/30 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <input
                  value={form.district}
                  onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                  placeholder="อำเภอ"
                  className="flex-1 text-sm bg-surface-low border border-outline-variant/30 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            ) : (
              <p className="text-sm text-on-surface mt-0.5">
                {[org.province, org.district].filter(Boolean).join(" / ") || "—"}
              </p>
            )}
          </div>

          {/* Contact */}
          {(org.phone || org.email || editing) && (
            <div>
              <span className="text-xs text-outline font-bold uppercase tracking-wider flex items-center gap-1">
                <Phone size={11} /> ติดต่อ
              </span>
              {editing ? (
                <div className="space-y-1 mt-1">
                  <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="โทรศัพท์" className="w-full text-sm bg-surface-low border border-outline-variant/30 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="อีเมล" className="w-full text-sm bg-surface-low border border-outline-variant/30 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  <input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="เว็บไซต์" className="w-full text-sm bg-surface-low border border-outline-variant/30 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              ) : (
                <div className="mt-0.5 space-y-0.5 text-sm text-on-surface">
                  {org.phone && <p className="flex items-center gap-1"><Phone size={12} className="text-outline" />{org.phone}</p>}
                  {org.email && <p className="flex items-center gap-1"><Mail size={12} className="text-outline" />{org.email}</p>}
                  {org.website && <p className="flex items-center gap-1"><Globe size={12} className="text-outline" /><a href={org.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{org.website}</a></p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Edit actions */}
        {editing && (
          <div className="mt-5 pt-4 border-t border-outline-variant/20 flex items-center gap-3">
            {error && <p className="text-xs text-error flex-1">{error}</p>}
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => { setEditing(false); resetForm(org); setError(""); }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-outline border border-outline-variant/30 rounded-xl hover:bg-surface-low transition-colors"
              >
                <X size={14} /> ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Save size={14} /> {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      {profile && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-primary" />
              <span className="text-xs font-bold text-outline uppercase tracking-wider">นักเรียน</span>
            </div>
            <p className="text-3xl font-black text-primary">{profile.studentCount?.toLocaleString() ?? "—"}</p>
            <p className="text-xs text-outline mt-1">ปีการศึกษา {profile.profileYear}</p>
          </div>
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-secondary" />
              <span className="text-xs font-bold text-outline uppercase tracking-wider">ครู/บุคลากร</span>
            </div>
            <p className="text-3xl font-black text-secondary">{profile.teacherCount?.toLocaleString() ?? "—"}</p>
            <p className="text-xs text-outline mt-1">ปีการศึกษา {profile.profileYear}</p>
          </div>
        </div>
      )}

      {/* Child organizations */}
      {org.childOrganizations && org.childOrganizations.length > 0 && (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
          <h2 className="font-bold text-on-surface mb-3 flex items-center gap-2">
            <Building2 size={16} className="text-primary" /> หน่วยงานในสังกัด ({org.childOrganizations.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {org.childOrganizations.map((c) => (
              <Link
                key={c.id}
                href={`/organizations/${c.id}`}
                className="flex items-center gap-2 p-3 rounded-xl bg-surface-low hover:bg-primary/5 transition-colors text-sm"
              >
                <Building2 size={14} className="text-outline flex-shrink-0" />
                <span className="text-on-surface font-medium truncate">{c.name}</span>
                <ChevronRight size={13} className="text-outline ml-auto flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href={`/cases?organizationId=${org.id}`}
          className="flex items-center gap-3 bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5 hover:border-primary/20 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText size={20} className="text-primary" />
          </div>
          <div>
            <p className="font-bold text-on-surface">หนังสือรับ</p>
            <p className="text-xs text-outline">ดูทะเบียนหนังสือของหน่วยงาน</p>
          </div>
          <ChevronRight size={16} className="text-outline ml-auto" />
        </Link>
        <Link
          href={`/reports/${org.id}/summary`}
          className="flex items-center gap-3 bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5 hover:border-primary/20 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
            <FileText size={20} className="text-secondary" />
          </div>
          <div>
            <p className="font-bold text-on-surface">รายงาน</p>
            <p className="text-xs text-outline">สรุปภาพรวมและสถิติ</p>
          </div>
          <ChevronRight size={16} className="text-outline ml-auto" />
        </Link>
      </div>
    </div>
  );
}
