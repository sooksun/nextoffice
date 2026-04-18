"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

/**
 * Dictionary of known path segments → Thai labels.
 * Unknown segments fall back to the raw slug (humanised).
 */
const LABEL_MAP: Record<string, string> = {
  // Top-level
  "": "หน้าหลัก",
  intakes: "เอกสารขาเข้า",
  documents: "คลังเอกสาร",
  cases: "เอกสารค้างรับ",
  inbox: "เอกสารเข้า",
  outbound: "เอกสารส่ง",
  presentation: "แฟ้มนำเสนอ",
  director: "ผู้อำนวยการ",
  signing: "รอลงนาม",
  saraban: "สารบรรณ",
  external: "หนังสือภายนอก",
  memo: "หนังสือภายใน",
  directive: "หนังสือสั่งการ",
  pr: "หนังสือประชาสัมพันธ์",
  circular: "หนังสือเวียน",
  "e-doc": "หนังสืออิเล็กทรอนิกส์",
  email: "ไปรษณีย์อิเล็กทรอนิกส์",
  archive: "เก็บเอกสาร",
  loans: "ยืม-คืนเอกสาร",
  handover: "ส่งมอบเอกสาร",
  reports: "รายงาน",
  district: "ระดับเขต",
  attendance: "ลงเวลา",
  leave: "ลาหยุด",
  travel: "ไปราชการ",
  approvals: "รออนุมัติ",
  horizon: "Horizon",
  sources: "แหล่งข้อมูล",
  agendas: "วาระนโยบาย",
  signals: "สัญญาณ",
  knowledge: "ความรู้",
  import: "นำเข้า",
  vault: "Vault",
  graph: "Knowledge Graph",
  settings: "ตั้งค่า",
  staff: "บุคลากร",
  prompts: "AI Prompts",
  "line-accounts": "LINE",
  admin: "Admin",
  "chat-analytics": "Chat Analytics",
  organizations: "หน่วยงาน",
  "work-groups": "โครงสร้างองค์กร",
  projects: "โครงการ",
  messages: "ข้อความ",
  webboard: "เว็บบอร์ด",
  news: "ข่าวประชาสัมพันธ์",
  tender: "ข่าวประกวดราคา",
  calendar: "ปฏิทิน",
  download: "ดาวน์โหลด",
  track: "ติดตาม QR",
  about: "เกี่ยวกับ",
  terms: "ข้อกำหนด",
  privacy: "ความเป็นส่วนตัว",
  notifications: "การแจ้งเตือน",
  help: "ช่วยเหลือ",
  new: "สร้างใหม่",
  edit: "แก้ไข",
};

function humanise(slug: string): string {
  return LABEL_MAP[slug] ?? slug.replace(/-/g, " ");
}

/**
 * Auto-built breadcrumb from the current pathname.
 * Numeric segments render as "#{id}" rather than raw numbers.
 * Collapses to "Home / … / last-2" when depth > 3.
 */
export default function Breadcrumb({ className = "" }: { className?: string }) {
  const pathname = usePathname() ?? "/";

  const items = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const trail: Array<{ label: string; href: string }> = [
      { label: "หน้าหลัก", href: "/" },
    ];
    let acc = "";
    for (const p of parts) {
      acc += `/${p}`;
      const label = /^\d+$/.test(p) ? `#${p}` : humanise(p);
      trail.push({ label, href: acc });
    }
    return trail;
  }, [pathname]);

  // Collapse if too long
  const rendered = items.length > 4
    ? [items[0], { label: "…", href: "" }, ...items.slice(-2)]
    : items;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-1 text-sm text-on-surface-variant min-w-0 ${className}`}
    >
      {rendered.map((item, idx) => {
        const isLast = idx === rendered.length - 1;
        const isHome = idx === 0;
        const isEllipsis = item.label === "…" && !item.href;
        return (
          <Fragment key={`${item.href}-${idx}`}>
            {idx > 0 && <ChevronRight size={14} className="text-outline/50 flex-none" />}
            {isEllipsis ? (
              <span className="px-1 opacity-60">…</span>
            ) : isLast ? (
              <span className="font-semibold text-on-surface truncate">
                {isHome && <Home size={13} className="inline mr-1 -mt-0.5" />}
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="hover:text-primary transition-colors truncate"
              >
                {isHome && <Home size={13} className="inline mr-1 -mt-0.5" />}
                {item.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
