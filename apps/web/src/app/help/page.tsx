import { HelpCircle, MessageSquareText, FileText, Bot, Building2, BookOpen, Phone, Mail, ChevronDown } from "lucide-react";

export const metadata = {
  title: "ศูนย์ช่วยเหลือ — NextOffice",
};

const faqs = [
  {
    q: "วิธีรับเอกสารผ่าน LINE Bot ทำอย่างไร?",
    a: "ส่งรูปถ่ายหรือไฟล์เอกสารเข้า LINE Official Account ของหน่วยงาน ระบบจะ OCR และจำแนกประเภทอัตโนมัติ จากนั้นสามารถลงรับหรือมอบหมายงานผ่าน LINE ได้ทันที",
  },
  {
    q: "ผูกบัญชี LINE กับระบบอย่างไร?",
    a: "พิมพ์ข้อความ \"ผูกบัญชี\" ใน LINE Bot แล้วป้อนอีเมลที่ผู้ดูแลระบบลงทะเบียนไว้ หรือใช้รหัส 6 หลักที่ได้รับจาก Admin",
  },
  {
    q: "ดูสถานะหนังสือรับได้ที่ไหน?",
    a: "ไปที่เมนู เคส หรือ ทะเบียนรับ ในแถบด้านซ้าย สามารถกรองตามสถานะ ระดับความเร่งด่วน หรือช่วงวันที่ได้",
  },
  {
    q: "การมอบหมายงานผ่าน LINE ทำอย่างไร?",
    a: "พิมพ์ \"มอบหมาย #เลขเคส\" ใน LINE Bot ระบบจะแสดงรายชื่อผู้รับผิดชอบที่ AI แนะนำตามเนื้อหาหนังสือ เลือกชื่อเพื่อมอบหมายงาน",
  },
  {
    q: "ลืมรหัสผ่านทำอย่างไร?",
    a: "ติดต่อผู้ดูแลระบบ (Admin) ของหน่วยงาน เพื่อขอรีเซตรหัสผ่าน Admin สามารถรีเซตได้ผ่าน Swagger API ที่ /api/docs",
  },
  {
    q: "Smart Routing คืออะไร?",
    a: "ระบบ AI วิเคราะห์หัวเรื่องและเนื้อหาหนังสือ แล้วแนะนำกลุ่มงานและผู้รับผิดชอบที่เหมาะสมโดยอัตโนมัติ เช่น หนังสือเรื่องงบประมาณจะถูกส่งไปยังกลุ่มงานงบประมาณ",
  },
  {
    q: "Audit Trail ดูได้ที่ไหน?",
    a: "ไปที่ รายงาน → เลือกหน่วยงาน → Audit Trail จะแสดงประวัติการดำเนินงานทุกขั้นตอน ทั้งการลงรับ มอบหมาย และเปลี่ยนสถานะ",
  },
  {
    q: "เพิ่มความรู้ให้ RAG ได้อย่างไร?",
    a: "ไปที่เมนู ฐานข้อมูลความรู้ → เพิ่มความรู้ใหม่ ระบุหัวข้อ เนื้อหา และประเภท ระบบจะนำไปใช้ตอบคำถามและแนะนำแนวทางปฏิบัติ",
  },
];

const guides = [
  { icon: FileText, title: "การรับหนังสือราชการ", desc: "ขั้นตอนตั้งแต่รับเอกสาร → OCR → ลงรับ → มอบหมาย → ติดตาม", color: "bg-primary/10 text-primary" },
  { icon: Bot, title: "การใช้งาน AI สารบรรณ", desc: "วิธีถามคำถาม สรุปเอกสาร ร่างหนังสือตอบ และดึงสาระสำคัญ", color: "bg-secondary/10 text-secondary" },
  { icon: MessageSquareText, title: "LINE Bot คำสั่งทั้งหมด", desc: "รายการคำสั่งที่ใช้ได้ใน LINE: ลงรับ มอบหมาย รับทราบ เสร็จแล้ว งานของฉัน", color: "bg-tertiary/10 text-tertiary" },
  { icon: Building2, title: "การตั้งค่าหน่วยงาน", desc: "เพิ่มผู้ใช้ กำหนดกลุ่มงาน และผูกบัญชี LINE กับระบบ", color: "bg-primary/10 text-primary" },
  { icon: BookOpen, title: "ฐานข้อมูลความรู้", desc: "การเพิ่ม แก้ไข และจัดการความรู้สำหรับระบบ RAG", color: "bg-secondary/10 text-secondary" },
];

const lineCommands = [
  { cmd: "ลงรับ #3", desc: "ลงรับเคส #3 อย่างเป็นทางการ" },
  { cmd: "มอบหมาย #3", desc: "เลือกผู้รับผิดชอบเคส #3 (เฉพาะ ผอ./รอง ผอ.)" },
  { cmd: "รับทราบ #5", desc: "ยืนยันรับทราบงานหมายเลข assignment 5" },
  { cmd: "เสร็จแล้ว #5", desc: "รายงานงาน assignment 5 เสร็จสิ้น" },
  { cmd: "งานของฉัน", desc: "ดูรายการงานที่ได้รับมอบหมายทั้งหมด" },
  { cmd: "ผูกบัญชี", desc: "เริ่มกระบวนการผูก LINE กับบัญชีในระบบ" },
];

export default function HelpPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <HelpCircle size={22} className="text-primary" />
          </div>
          <h1 className="text-2xl font-black text-primary tracking-tight">ศูนย์ช่วยเหลือ</h1>
        </div>
        <p className="text-sm text-on-surface-variant">คู่มือการใช้งาน NextOffice AI E-Office และคำถามที่พบบ่อย</p>
      </div>

      {/* Quick guides */}
      <section>
        <h2 className="text-base font-bold text-on-surface mb-3">คู่มือการใช้งาน</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {guides.map((g) => (
            <div key={g.title} className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-4 flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${g.color}`}>
                <g.icon size={18} />
              </div>
              <div>
                <p className="font-bold text-on-surface text-sm">{g.title}</p>
                <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{g.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* LINE commands */}
      <section>
        <h2 className="text-base font-bold text-on-surface mb-3 flex items-center gap-2">
          <MessageSquareText size={18} className="text-primary" />
          คำสั่ง LINE Bot
        </h2>
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm divide-y divide-outline-variant/10">
          {lineCommands.map((c) => (
            <div key={c.cmd} className="flex items-center gap-4 px-5 py-3">
              <code className="text-sm font-bold text-primary bg-primary/10 px-3 py-1 rounded-lg flex-shrink-0 min-w-36">
                {c.cmd}
              </code>
              <p className="text-sm text-on-surface-variant">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="text-base font-bold text-on-surface mb-3 flex items-center gap-2">
          <ChevronDown size={18} className="text-primary" />
          คำถามที่พบบ่อย (FAQ)
        </h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <details
              key={i}
              className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm group"
            >
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none font-bold text-sm text-on-surface hover:text-primary transition-colors">
                {f.q}
                <ChevronDown size={16} className="text-outline flex-shrink-0 ml-3 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="px-5 pb-4 text-sm text-on-surface-variant leading-relaxed border-t border-outline-variant/10 pt-3">
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section>
        <h2 className="text-base font-bold text-on-surface mb-3">ติดต่อสอบถาม</h2>
        <div className="bg-gradient-to-br from-primary/5 to-secondary/5 rounded-2xl border border-outline-variant/10 shadow-sm p-5 grid sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Mail size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-xs text-outline font-bold uppercase tracking-wider">อีเมล</p>
              <a href="mailto:support@cnppai.com" className="text-sm text-primary hover:underline font-medium">
                support@cnppai.com
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <Phone size={18} className="text-secondary" />
            </div>
            <div>
              <p className="text-xs text-outline font-bold uppercase tracking-wider">โทรศัพท์</p>
              <p className="text-sm text-on-surface font-medium">053-xxx-xxxx</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-outline mt-3 text-center">
          NextOffice AI E-Office — พัฒนาโดย CNPP AI · เวอร์ชัน 1.0
        </p>
      </section>
    </div>
  );
}
