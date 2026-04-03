export const metadata = {
  title: "ข้อกำหนดการใช้บริการ — NextOffice",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-black text-primary tracking-tight mb-2">ข้อกำหนดการใช้บริการ</h1>
      <p className="text-sm text-on-surface-variant mb-8">ปรับปรุงล่าสุด: 4 เมษายน 2569</p>

      <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-8 shadow-sm space-y-8 text-sm text-on-surface leading-relaxed">

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">1. การยอมรับข้อกำหนด</h2>
          <p>
            การเข้าใช้งานระบบ NextOffice AI E-Office (&quot;ระบบ&quot;) ถือว่าท่านได้อ่าน เข้าใจ
            และยอมรับข้อกำหนดการใช้บริการฉบับนี้ทั้งหมด หากท่านไม่ยอมรับข้อกำหนดเหล่านี้
            กรุณาหยุดการใช้งานระบบทันที
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">2. คำจำกัดความ</h2>
          <ul className="list-disc list-inside space-y-1.5 text-on-surface-variant">
            <li><strong className="text-on-surface">&quot;ระบบ&quot;</strong> หมายถึง แพลตฟอร์ม NextOffice AI E-Office รวมถึงเว็บแอปพลิเคชัน, LINE Bot และ API ที่เกี่ยวข้อง</li>
            <li><strong className="text-on-surface">&quot;ผู้ใช้&quot;</strong> หมายถึง บุคลากรของสถาบันการศึกษาที่ได้รับอนุญาตให้เข้าใช้งานระบบ</li>
            <li><strong className="text-on-surface">&quot;เอกสาร&quot;</strong> หมายถึง หนังสือราชการ ไฟล์ และข้อมูลทุกประเภทที่อัปโหลดเข้าสู่ระบบ</li>
            <li><strong className="text-on-surface">&quot;AI&quot;</strong> หมายถึง ระบบปัญญาประดิษฐ์ที่ใช้ในการประมวลผลเอกสาร รวมถึง OCR, การจำแนกประเภท และ RAG</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">3. ขอบเขตการให้บริการ</h2>
          <p className="mb-3">ระบบให้บริการดังต่อไปนี้:</p>
          <ul className="list-disc list-inside space-y-1.5 text-on-surface-variant">
            <li>รับเอกสารผ่าน LINE Bot และการอัปโหลดโดยตรง</li>
            <li>การอ่านข้อความอัตโนมัติ (OCR) จากเอกสารภาพและ PDF</li>
            <li>การจำแนกประเภทเอกสารด้วย AI (หนังสือราชการ/เอกสารทั่วไป)</li>
            <li>การสกัดข้อมูลสำคัญและสร้างสรุปเอกสาร</li>
            <li>ระบบ RAG สำหรับการตอบคำถามเกี่ยวกับระเบียบงานสารบรรณ</li>
            <li>การวิเคราะห์เคสและเสนอแนวทางปฏิบัติ</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">4. หน้าที่และความรับผิดชอบของผู้ใช้</h2>
          <ul className="list-disc list-inside space-y-1.5 text-on-surface-variant">
            <li>ใช้งานระบบเพื่อวัตถุประสงค์ทางราชการและการศึกษาเท่านั้น</li>
            <li>รักษาความลับของรหัสผ่านและข้อมูลการเข้าสู่ระบบ</li>
            <li>ไม่อัปโหลดเนื้อหาที่ผิดกฎหมาย ลามกอนาจาร หรือละเมิดลิขสิทธิ์</li>
            <li>ตรวจสอบความถูกต้องของผลลัพธ์จาก AI ก่อนนำไปใช้งานจริง</li>
            <li>แจ้งผู้ดูแลระบบทันทีหากพบข้อผิดพลาดหรือการเข้าถึงโดยไม่ได้รับอนุญาต</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">5. ข้อจำกัดของระบบ AI</h2>
          <div className="bg-error-container/30 border border-error/10 rounded-xl p-4">
            <p className="text-on-surface">
              ผลลัพธ์จากระบบ AI เป็นเพียงข้อเสนอแนะเท่านั้น ไม่ถือเป็นคำตอบสุดท้ายหรือคำแนะนำทางกฎหมาย
              ผู้ใช้ต้องใช้วิจารณญาณของตนเองในการตัดสินใจ สถาบันการศึกษาและทีมพัฒนาไม่รับผิดชอบ
              ต่อความเสียหายที่เกิดจากการปฏิบัติตามคำแนะนำของ AI โดยไม่ได้ตรวจสอบ
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">6. ทรัพย์สินทางปัญญา</h2>
          <p>
            ระบบ NextOffice รวมถึงซอร์สโค้ด การออกแบบ และเอกสารประกอบ
            เป็นทรัพย์สินทางปัญญาของทีมพัฒนา เอกสารที่ผู้ใช้อัปโหลดยังคงเป็นทรัพย์สินของสถาบันการศึกษาต้นสังกัด
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">7. การระงับและยกเลิกบริการ</h2>
          <p>
            ผู้ดูแลระบบสงวนสิทธิ์ในการระงับหรือยกเลิกบัญชีผู้ใช้ที่ฝ่าฝืนข้อกำหนดเหล่านี้
            หรือใช้งานระบบในทางที่ไม่เหมาะสม โดยจะแจ้งให้ทราบล่วงหน้าตามสมควร
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">8. การเปลี่ยนแปลงข้อกำหนด</h2>
          <p>
            ทีมพัฒนาสงวนสิทธิ์ในการแก้ไขข้อกำหนดเหล่านี้ได้ตลอดเวลา
            การเปลี่ยนแปลงจะมีผลบังคับใช้เมื่อประกาศบนระบบ
            การใช้งานต่อหลังการเปลี่ยนแปลงถือว่าท่านยอมรับข้อกำหนดใหม่
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">9. ติดต่อ</h2>
          <p>
            หากมีคำถามเกี่ยวกับข้อกำหนดการใช้บริการ สามารถติดต่อผู้ดูแลระบบผ่านทางเมนู &quot;ศูนย์ช่วยเหลือ&quot; ในระบบ
          </p>
        </section>

      </div>
    </div>
  );
}
