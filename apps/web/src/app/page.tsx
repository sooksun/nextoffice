import { apiFetch } from "@/lib/api";
import { FileText, Briefcase, FolderOpen, Building2 } from "lucide-react";

interface Paged { total: number; data: unknown[] }
function countResult(val: unknown): number {
  if (Array.isArray(val)) return val.length;
  if (val && typeof val === "object" && "total" in val) return (val as Paged).total;
  return 0;
}

async function getStats() {
  const [intakes, cases, documents, orgs] = await Promise.allSettled([
    apiFetch<unknown>("/intake"),
    apiFetch<unknown>("/cases"),
    apiFetch<unknown>("/documents"),
    apiFetch<unknown>("/organizations"),
  ]);

  return {
    intakes: intakes.status === "fulfilled" ? countResult(intakes.value) : 0,
    cases: cases.status === "fulfilled" ? countResult(cases.value) : 0,
    documents: documents.status === "fulfilled" ? countResult(documents.value) : 0,
    orgs: orgs.status === "fulfilled" ? countResult(orgs.value) : 0,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();

  const cards = [
    { label: "เอกสารขาเข้า", value: stats.intakes, Icon: FileText, accent: "text-primary bg-primary-fixed" },
    { label: "เคส", value: stats.cases, Icon: Briefcase, accent: "text-secondary bg-secondary-fixed" },
    { label: "เอกสาร", value: stats.documents, Icon: FolderOpen, accent: "text-tertiary bg-tertiary-fixed" },
    { label: "หน่วยงาน", value: stats.orgs, Icon: Building2, accent: "text-primary bg-primary-fixed-dim/30" },
  ];

  return (
    <div>
      <h1 className="text-3xl font-black text-primary tracking-tight mb-2">ภาพรวมระบบ</h1>
      <p className="text-sm text-on-surface-variant mb-6">ยินดีต้อนรับสู่ NextOffice AI E-Office</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((c) => (
          <div key={c.label} className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4 shadow-sm hover:shadow-md hover:border-outline-variant/30 transition-all">
            <div className={`rounded-xl p-3 ${c.accent}`}>
              <c.Icon size={20} />
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">{c.label}</p>
              <p className="text-2xl font-bold text-on-surface">{c.value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 bg-gradient-to-br from-primary to-secondary rounded-2xl p-6 shadow-xl shadow-primary/20 text-on-primary">
        <h2 className="font-bold text-lg mb-2">AI สารบรรณ พร้อมใช้งาน</h2>
        <p className="text-sm text-on-primary/80 leading-relaxed">
          ระบบ RAG 3 ชั้น (Horizon, Policy, Context) พร้อมให้บริการ
          รองรับการรับเอกสารผ่าน LINE bot, OCR อัตโนมัติ, และการจำแนกประเภทด้วย AI
        </p>
        <div className="flex gap-3 mt-4">
          <div className="bg-white/10 rounded-xl px-3 py-2 text-xs font-bold">LINE Bot</div>
          <div className="bg-white/10 rounded-xl px-3 py-2 text-xs font-bold">OCR</div>
          <div className="bg-white/10 rounded-xl px-3 py-2 text-xs font-bold">RAG</div>
          <div className="bg-white/10 rounded-xl px-3 py-2 text-xs font-bold">Claude AI</div>
        </div>
      </div>
    </div>
  );
}
