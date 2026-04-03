export const metadata = {
  title: "นโยบายความเป็นส่วนตัว — NextOffice",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-black text-primary tracking-tight mb-2">นโยบายความเป็นส่วนตัว</h1>
      <p className="text-sm text-on-surface-variant mb-8">ปรับปรุงล่าสุด: 4 เมษายน 2569</p>

      <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-8 shadow-sm space-y-8 text-sm text-on-surface leading-relaxed">

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">1. บทนำ</h2>
          <p>
            นโยบายความเป็นส่วนตัวฉบับนี้อธิบายวิธีการที่ระบบ NextOffice AI E-Office (&quot;ระบบ&quot;)
            เก็บรวบรวม ใช้งาน จัดเก็บ และปกป้องข้อมูลส่วนบุคคลของผู้ใช้ (&quot;ท่าน&quot;)
            ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">2. ข้อมูลที่เก็บรวบรวม</h2>

          <h3 className="text-sm font-bold text-on-surface mt-4 mb-2">2.1 ข้อมูลส่วนบุคคล</h3>
          <ul className="list-disc list-inside space-y-1.5 text-on-surface-variant">
            <li>ชื่อ-นามสกุล และข้อมูลติดต่อที่เกี่ยวข้องกับบัญชีผู้ใช้</li>
            <li>LINE User ID และข้อมูลโปรไฟล์จาก LINE Platform</li>
            <li>ข้อมูลการเข้าสู่ระบบ (วันเวลา, IP Address)</li>
          </ul>

          <h3 className="text-sm font-bold text-on-surface mt-4 mb-2">2.2 ข้อมูลเอกสาร</h3>
          <ul className="list-disc list-inside space-y-1.5 text-on-surface-variant">
            <li>เอกสารที่อัปโหลดผ่าน LINE Bot หรือเว็บแอปพลิเคชัน</li>
            <li>ข้อความที่สกัดจาก OCR</li>
            <li>ผลการจำแนกประเภทและการวิเคราะห์โดย AI</li>
            <li>ข้อมูลเมตา (Metadata) ของเอกสาร เช่น ประเภท, เลขที่หนังสือ, วันที่</li>
          </ul>

          <h3 className="text-sm font-bold text-on-surface mt-4 mb-2">2.3 ข้อมูลการใช้งาน</h3>
          <ul className="list-disc list-inside space-y-1.5 text-on-surface-variant">
            <li>ประวัติการสนทนากับ AI สารบรรณ</li>
            <li>คำถามที่ถามผ่านระบบ RAG</li>
            <li>การดำเนินการกับเคสและเอกสาร</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">3. วัตถุประสงค์ในการใช้ข้อมูล</h2>
          <ul className="list-disc list-inside space-y-1.5 text-on-surface-variant">
            <li>ให้บริการระบบจัดการเอกสารอัตโนมัติ (OCR, จำแนกประเภท, สกัดข้อมูล)</li>
            <li>ตอบคำถามเกี่ยวกับระเบียบงานสารบรรณผ่านระบบ RAG</li>
            <li>วิเคราะห์เคสและเสนอแนวทางปฏิบัติ</li>
            <li>ปรับปรุงประสิทธิภาพและความแม่นยำของระบบ AI</li>
            <li>รักษาความปลอดภัยและป้องกันการใช้งานที่ไม่เหมาะสม</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">4. การประมวลผลโดย AI</h2>
          <div className="bg-primary-fixed/30 border border-primary/10 rounded-xl p-4 space-y-2">
            <p>ระบบใช้บริการ AI ของ Anthropic (Claude) ในการประมวลผลเอกสาร:</p>
            <ul className="list-disc list-inside space-y-1.5 text-on-surface-variant">
              <li>ข้อความจากเอกสารจะถูกส่งไปยัง API ของ Anthropic เพื่อการวิเคราะห์</li>
              <li>Anthropic ไม่เก็บข้อมูลจาก API calls เพื่อการฝึก model</li>
              <li>การส่งข้อมูลเป็นแบบเข้ารหัส (HTTPS/TLS)</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">5. การจัดเก็บข้อมูล</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface-low rounded-xl p-4">
              <h4 className="text-xs font-bold text-outline uppercase tracking-wider mb-2">ฐานข้อมูล</h4>
              <p className="text-xs text-on-surface-variant">MariaDB — ข้อมูลเอกสาร, เคส, ผู้ใช้</p>
            </div>
            <div className="bg-surface-low rounded-xl p-4">
              <h4 className="text-xs font-bold text-outline uppercase tracking-wider mb-2">ไฟล์เอกสาร</h4>
              <p className="text-xs text-on-surface-variant">MinIO (Object Storage) — ไฟล์ต้นฉบับ</p>
            </div>
          </div>
          <p className="mt-3 text-on-surface-variant">
            ข้อมูลทั้งหมดจัดเก็บภายในเซิร์ฟเวอร์ของสถาบัน ไม่มีการส่งข้อมูลไปจัดเก็บบนคลาวด์ภายนอก
            ยกเว้นการประมวลผล AI ตามที่ระบุในข้อ 4
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">6. สิทธิของเจ้าของข้อมูล</h2>
          <p className="mb-3">ตาม PDPA ท่านมีสิทธิดังต่อไปนี้:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { title: "สิทธิในการเข้าถึง", desc: "ขอดูข้อมูลส่วนบุคคลของท่านที่ระบบจัดเก็บ" },
              { title: "สิทธิในการแก้ไข", desc: "ขอแก้ไขข้อมูลส่วนบุคคลให้ถูกต้องและเป็นปัจจุบัน" },
              { title: "สิทธิในการลบ", desc: "ขอลบข้อมูลส่วนบุคคลเมื่อหมดความจำเป็น" },
              { title: "สิทธิในการคัดค้าน", desc: "คัดค้านการประมวลผลข้อมูลส่วนบุคคลของท่าน" },
            ].map((right) => (
              <div key={right.title} className="bg-surface-low rounded-xl p-3 border border-outline-variant/10">
                <h4 className="text-xs font-bold text-on-surface mb-1">{right.title}</h4>
                <p className="text-[11px] text-on-surface-variant">{right.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">7. การรักษาความปลอดภัย</h2>
          <ul className="list-disc list-inside space-y-1.5 text-on-surface-variant">
            <li>การเข้ารหัสข้อมูลระหว่างการส่ง (TLS/HTTPS)</li>
            <li>การยืนยันตัวตนผ่าน LINE OAuth และ JWT Token</li>
            <li>การตรวจสอบลายเซ็น Webhook (LINE Signature Validation)</li>
            <li>การจำกัดสิทธิ์การเข้าถึงตามบทบาท</li>
            <li>การบันทึก Log การเข้าใช้งาน</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">8. การเปิดเผยข้อมูลแก่บุคคลภายนอก</h2>
          <p>
            ระบบจะไม่เปิดเผยข้อมูลส่วนบุคคลของท่านแก่บุคคลภายนอก ยกเว้นในกรณีดังต่อไปนี้:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-on-surface-variant mt-2">
            <li>ได้รับความยินยอมจากท่าน</li>
            <li>เป็นการปฏิบัติตามกฎหมายหรือคำสั่งศาล</li>
            <li>จำเป็นเพื่อการให้บริการ (เช่น การส่งข้อมูลไปยัง Anthropic API เพื่อประมวลผล AI)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">9. การเปลี่ยนแปลงนโยบาย</h2>
          <p>
            ระบบอาจปรับปรุงนโยบายความเป็นส่วนตัวเป็นครั้งคราว
            การเปลี่ยนแปลงจะประกาศบนระบบและมีผลบังคับใช้ทันที
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">10. ติดต่อเจ้าหน้าที่คุ้มครองข้อมูล</h2>
          <div className="bg-surface-low rounded-xl p-4">
            <p className="text-on-surface-variant">
              หากท่านมีคำถามหรือข้อกังวลเกี่ยวกับนโยบายความเป็นส่วนตัว
              หรือต้องการใช้สิทธิตาม PDPA สามารถติดต่อผ่านเมนู &quot;ศูนย์ช่วยเหลือ&quot; ในระบบ
              หรือแจ้งผู้ดูแลระบบของสถาบันการศึกษาต้นสังกัด
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}
