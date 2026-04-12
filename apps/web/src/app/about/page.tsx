import Link from "next/link";
import { ArrowLeft, Building2, Cpu, FileText, Users, Shield, Globe } from "lucide-react";

const FEATURES = [
  {
    icon: FileText,
    title: "ระบบสารบรรณดิจิทัล",
    desc: "รับ-ส่งเอกสาร ทะเบียนรับ-ส่ง สมุดส่ง/ใบรับ ยืม-คืนเอกสาร และบัญชีส่งมอบ 20 ปี ครบในที่เดียว",
  },
  {
    icon: Cpu,
    title: "AI อัจฉริยะ",
    desc: "สกัดข้อมูลจากเอกสารอัตโนมัติด้วย Gemini AI — ลดเวลาบันทึกข้อมูลลงกว่า 80%",
  },
  {
    icon: Globe,
    title: "LINE Bot Integration",
    desc: "รับเอกสารผ่าน LINE Bot พร้อม OCR และจำแนกประเภทอัตโนมัติ",
  },
  {
    icon: Shield,
    title: "ปลอดภัยด้วยมาตรฐานราชการ",
    desc: "ชั้นความลับ ชั้นความเร็ว ลายเซ็นดิจิทัล และ QR Code ติดตามเอกสารทุกฉบับ",
  },
  {
    icon: Users,
    title: "รองรับหลายหน่วยงาน",
    desc: "Multi-tenant รองรับสำนักงานเขต โรงเรียน และหน่วยงานในสังกัดทั้งหมด",
  },
];

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Link
        href="/help"
        className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-6"
      >
        <ArrowLeft size={16} /> ย้อนกลับ
      </Link>

      {/* Hero */}
      <div className="flex flex-col items-center text-center gap-4 mb-10">
        <div className="w-20 h-20 rounded-3xl bg-primary flex items-center justify-center shadow-xl shadow-primary/20">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v18" />
            <path d="M3 12h18" />
            <path d="M3.5 5.5l17 13" />
            <path d="M20.5 5.5l-17 13" />
          </svg>
        </div>
        <div>
          <h1 className="text-3xl font-black text-primary tracking-tight">Next Office</h1>
          <p className="text-xs uppercase tracking-widest text-outline font-bold mt-1">Education AI Platform</p>
        </div>
        <p className="text-sm text-on-surface-variant max-w-md leading-relaxed">
          ระบบสำนักงานอัจฉริยะสำหรับสถานศึกษา ขับเคลื่อนด้วย AI เพื่อยกระดับการบริหารจัดการเอกสารและการสื่อสารองค์กร
        </p>
      </div>

      {/* Features */}
      <div className="space-y-3 mb-10">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="flex items-start gap-4 p-4 rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Icon size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-on-surface">{title}</p>
              <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm p-6 space-y-3 text-sm">
        <div className="flex items-center gap-3">
          <Building2 size={16} className="text-primary shrink-0" />
          <div>
            <p className="text-xs text-on-surface-variant">พัฒนาโดย</p>
            <p className="font-semibold text-on-surface">ทีมพัฒนา Next Office</p>
          </div>
        </div>
        <div className="border-t border-outline-variant/10 pt-3 flex items-center gap-3">
          <Globe size={16} className="text-primary shrink-0" />
          <div>
            <p className="text-xs text-on-surface-variant">เว็บไซต์</p>
            <a
              href="https://nextoffice.cnppai.com"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              nextoffice.cnppai.com
            </a>
          </div>
        </div>
        <div className="border-t border-outline-variant/10 pt-3">
          <p className="text-xs text-on-surface-variant text-center">
            &copy; {new Date().getFullYear()} Next Office — Education AI Platform. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
