import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { Laptop, FileText, Send, Archive, Inbox } from "lucide-react";
import { toThaiNumerals } from "@/lib/thai-date";

export const dynamic = "force-dynamic";

const LETTER_TYPE_LABEL: Record<string, string> = {
  external_letter: "หนังสือภายนอก",
  internal_memo: "หนังสือภายใน",
  directive: "หนังสือสั่งการ",
  pr_letter: "หนังสือประชาสัมพันธ์",
  stamp_letter: "หนังสือประทับตรา",
  official_record: "หนังสือที่เจ้าหน้าที่ทำขึ้น",
  secret_letter: "หนังสือลับ",
};

interface OutboundDoc {
  id: number;
  letterType: string;
  status: string;
}

interface CaseCount {
  total: number;
}

async function getSummary() {
  try {
    const [docs, cases] = await Promise.all([
      apiFetch<OutboundDoc[]>("/outbound/my/documents").catch(() => [] as OutboundDoc[]),
      apiFetch<CaseCount>("/cases?take=1").catch(() => ({ total: 0 }) as CaseCount),
    ]);

    const byType: Record<string, number> = {};
    for (const d of docs) {
      byType[d.letterType] = (byType[d.letterType] ?? 0) + 1;
    }

    const sentCount = docs.filter((d) => d.status === "sent").length;
    const draftCount = docs.filter((d) => d.status === "draft").length;
    const pendingCount = docs.filter((d) => d.status === "pending_approval").length;

    return { docs, byType, sentCount, draftCount, pendingCount, inboundTotal: cases.total };
  } catch {
    return { docs: [], byType: {}, sentCount: 0, draftCount: 0, pendingCount: 0, inboundTotal: 0 };
  }
}

export default async function EDocPage() {
  const { docs, byType, sentCount, draftCount, pendingCount, inboundTotal } = await getSummary();

  const statCards = [
    { label: "หนังสือออกทั้งหมด", value: docs.length, icon: Send, color: "text-secondary", bg: "bg-secondary/10" },
    { label: "ส่งแล้ว", value: sentCount, icon: FileText, color: "text-green-600", bg: "bg-green-500/10" },
    { label: "รออนุมัติ", value: pendingCount, icon: Archive, color: "text-yellow-600", bg: "bg-yellow-500/10" },
    { label: "หนังสือเข้า (เคส)", value: inboundTotal, icon: Inbox, color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
          <Laptop size={20} className="text-indigo-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">หนังสืออิเล็กทรอนิกส์</h1>
          <p className="text-xs text-on-surface-variant">
            ตามระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ ฉ.๔ ข้อ ๒๙/๑ — ภาพรวมระบบสารบรรณอิเล็กทรอนิกส์
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
              <s.icon size={18} className={s.color} />
            </div>
            <div>
              <p className="text-2xl font-black text-primary">{toThaiNumerals(s.value)}</p>
              <p className="text-xs text-on-surface-variant">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Document type breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-5">
          <h2 className="text-sm font-bold text-on-surface-variant mb-4">จำนวนเอกสารตามประเภท</h2>
          <div className="space-y-2">
            {Object.entries(LETTER_TYPE_LABEL).map(([type, label]) => {
              const count = byType[type] ?? 0;
              const max = Math.max(...Object.values(byType), 1);
              const pct = Math.round((count / max) * 100);
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-xs text-on-surface-variant w-36 shrink-0">{label}</span>
                  <div className="flex-1 h-2 bg-surface-bright rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-primary w-8 text-right">{toThaiNumerals(count)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick links */}
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-5">
          <h2 className="text-sm font-bold text-on-surface-variant mb-4">ลิงก์ด่วน</h2>
          <div className="space-y-2">
            {[
              { href: "/saraban/external", label: "หนังสือภายนอก" },
              { href: "/saraban/memo", label: "หนังสือภายใน (บันทึกข้อความ)" },
              { href: "/saraban/directive?sub=order", label: "หนังสือสั่งการ" },
              { href: "/saraban/pr?sub=announcement", label: "หนังสือประชาสัมพันธ์" },
              { href: "/saraban/stamp-doc", label: "หนังสือประทับตรา" },
              { href: "/saraban/email", label: "ไปรษณีย์อิเล็กทรอนิกส์" },
              { href: "/saraban/inbound", label: "ทะเบียนรับ" },
              { href: "/saraban/outbound", label: "ทะเบียนส่ง" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-on-surface-variant hover:bg-surface-bright hover:text-primary transition-colors"
              >
                <FileText size={13} className="shrink-0" />
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Draft reminder */}
      {draftCount > 0 && (
        <div className="rounded-2xl border border-yellow-200/40 bg-yellow-500/5 p-4 flex gap-3">
          <Archive size={18} className="text-yellow-500 mt-0.5 shrink-0" />
          <div className="text-xs text-on-surface-variant">
            มีหนังสือร่างที่ยังไม่ได้ส่ง <strong>{toThaiNumerals(draftCount)} รายการ</strong> —{" "}
            <Link href="/outbound" className="text-primary underline">ดูหนังสือออก</Link>
          </div>
        </div>
      )}
    </div>
  );
}
