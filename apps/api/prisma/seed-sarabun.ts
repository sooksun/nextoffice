/**
 * Seed script: ข้อมูลสารบรรณพื้นฐานของราชการไทย
 * วิธีรัน: npx ts-node prisma/seed-sarabun.ts
 */
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('📚 กำลัง seed ข้อมูลสารบรรณพื้นฐาน...\n');

  // ─── Topics ──────────────────────────────────────────────────────────────
  const topicRoot = await upsertTopic('SARABUN', 'งานสารบรรณ', 'Correspondence Management');

  const topicTypes = await upsertTopic('SARABUN_TYPES', 'ประเภทหนังสือราชการ', 'Types of Official Letters', topicRoot.id);
  const topicReceive = await upsertTopic('SARABUN_RECEIVE', 'การรับหนังสือ', 'Document Reception', topicRoot.id);
  const topicSend = await upsertTopic('SARABUN_SEND', 'การส่งหนังสือ', 'Document Sending', topicRoot.id);
  const topicStore = await upsertTopic('SARABUN_STORE', 'การเก็บรักษา', 'Document Storage', topicRoot.id);
  const topicDestroy = await upsertTopic('SARABUN_DESTROY', 'การทำลาย', 'Document Destruction', topicRoot.id);

  const topicExternal = await upsertTopic('LETTER_EXTERNAL', 'หนังสือภายนอก', 'External Letter', topicTypes.id);
  const topicInternal = await upsertTopic('LETTER_INTERNAL', 'หนังสือภายใน', 'Internal Memo', topicTypes.id);
  const topicStamp = await upsertTopic('LETTER_STAMP', 'หนังสือประทับตรา', 'Stamped Letter', topicTypes.id);
  const topicOrder = await upsertTopic('LETTER_ORDER', 'หนังสือสั่งการ', 'Directive', topicTypes.id);
  const topicPR = await upsertTopic('LETTER_PR', 'หนังสือประชาสัมพันธ์', 'Public Relations', topicTypes.id);
  const topicRecord = await upsertTopic('LETTER_RECORD', 'หนังสือที่เจ้าหน้าที่ทำขึ้น', 'Staff-produced Document', topicTypes.id);

  console.log('✅ Topics สร้างเสร็จ');

  // ─── Document + PolicyItem: ระเบียบสารบรรณ พ.ศ. 2526 ────────────────────
  const doc1 = await prisma.document.create({
    data: {
      title: 'ระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ พ.ศ. 2526',
      sourceType: 'seed',
      documentType: 'regulation',
      sourceChannel: 'system',
      issuingAuthority: 'สำนักนายกรัฐมนตรี',
      trustLevel: 1.0,
      freshnessScore: 0.7,
      publishedAt: new Date('1983-06-01'),
      summaryText: 'ระเบียบหลักที่กำหนดหลักเกณฑ์และวิธีปฏิบัติในงานสารบรรณของส่วนราชการทั้งหมด ครอบคลุมการรับ-ส่ง เก็บรักษา ยืม และทำลายหนังสือราชการ',
      fullText: 'ระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ พ.ศ. 2526 และที่แก้ไขเพิ่มเติม (ฉบับที่ 2) พ.ศ. 2548 และ (ฉบับที่ 4) พ.ศ. 2564',
    },
  });

  const policy1 = await prisma.policyItem.create({
    data: {
      documentId: doc1.id,
      policyType: 'regulation',
      issuingAuthority: 'สำนักนายกรัฐมนตรี',
      jurisdictionLevel: 'national',
      policyNumber: 'ระเบียบสำนักนายกรัฐมนตรี พ.ศ. 2526',
      effectiveStatus: 'active',
      mandatoryLevel: 'mandatory',
      complianceRiskLevel: 'high',
      summaryForAction: 'ระเบียบหลักงานสารบรรณ กำหนดประเภทหนังสือราชการ 6 ประเภท หลักการรับ-ส่ง เก็บรักษา และทำลายหนังสือ',
    },
  });

  // Clauses: หนังสือราชการ 6 ประเภท
  const clauses = [
    {
      code: 'ข้อ 11',
      text: 'หนังสือภายนอก คือ หนังสือติดต่อราชการที่เป็นแบบพิธีการ ใช้กระดาษตราครุฑ ส่งระหว่างส่วนราชการ หรือส่วนราชการกับหน่วยงานอื่น รวมถึงบุคคลภายนอก',
      obligation: 'mandatory',
      action: 'ใช้กระดาษตราครุฑ พิมพ์ตามแบบที่กำหนด ลงเลขที่หนังสือ วันที่ เรื่อง คำขึ้นต้น อ้างถึง สิ่งที่ส่งมาด้วย ข้อความ คำลงท้าย ลงชื่อ ตำแหน่ง',
    },
    {
      code: 'ข้อ 12',
      text: 'หนังสือภายใน คือ หนังสือติดต่อราชการภายในกรมหรือจังหวัดเดียวกัน ใช้กระดาษบันทึกข้อความ',
      obligation: 'mandatory',
      action: 'ใช้กระดาษบันทึกข้อความ มีส่วนราชการ ที่ วันที่ เรื่อง คำขึ้นต้น ข้อความ ลงชื่อ ตำแหน่ง',
    },
    {
      code: 'ข้อ 13',
      text: 'หนังสือประทับตรา คือ หนังสือที่ใช้ประทับตราแทนการลงชื่อของหัวหน้าส่วนราชการระดับกรมขึ้นไป',
      obligation: 'conditional',
      action: 'ใช้ในกรณีที่ไม่ใช่เรื่องสำคัญ ให้ประทับตราชื่อส่วนราชการ ลงชื่อย่อกำกับตรา',
    },
    {
      code: 'ข้อ 14',
      text: 'หนังสือสั่งการ มี 3 ชนิด ได้แก่ คำสั่ง ระเบียบ และข้อบังคับ',
      obligation: 'mandatory',
      action: 'คำสั่ง: ผู้บังคับบัญชาสั่งให้ปฏิบัติ ระเบียบ: กำหนดวิธีปฏิบัติ ข้อบังคับ: กำหนดขอบเขตให้ปฏิบัติ',
    },
    {
      code: 'ข้อ 15',
      text: 'หนังสือประชาสัมพันธ์ มี 3 ชนิด ได้แก่ ประกาศ แถลงการณ์ และข่าว',
      obligation: 'informational',
      action: 'ประกาศ: แจ้งให้ทราบทั่วไป แถลงการณ์: แถลงเรื่องการเมือง ข่าว: แจ้งเหตุการณ์',
    },
    {
      code: 'ข้อ 16',
      text: 'หนังสือที่เจ้าหน้าที่ทำขึ้นหรือรับไว้เป็นหลักฐานในราชการ มี 4 ชนิด ได้แก่ หนังสือรับรอง รายงานการประชุม บันทึก และหนังสืออื่น',
      obligation: 'informational',
      action: 'จัดทำตามรูปแบบที่กำหนดในระเบียบ เก็บรักษาตามอายุที่กำหนด',
    },
    {
      code: 'หมวด 2',
      text: 'การรับหนังสือ: เมื่อได้รับหนังสือ ให้เจ้าหน้าที่ของหน่วยงานสารบรรณกลางตรวจสอบ ลงทะเบียนรับ ประทับตรารับ ลงเลขรับ วัน เดือน ปี และเวลาที่รับ แล้วจัดส่งให้ส่วนที่เกี่ยวข้องดำเนินการต่อ',
      obligation: 'mandatory',
      action: 'ตรวจสอบซอง → เปิดซอง → ลงทะเบียนรับ → ประทับตรารับ → จัดลำดับความสำคัญ → ส่งเสนอผู้บริหาร',
    },
    {
      code: 'หมวด 3',
      text: 'การส่งหนังสือ: ให้ส่วนราชการที่จะส่งหนังสือตรวจสอบความเรียบร้อย ลงทะเบียนส่ง และส่งหนังสือออกตามช่องทางที่กำหนด',
      obligation: 'mandatory',
      action: 'ร่างหนังสือ → ตรวจสอบ → ลงนาม → ลงทะเบียนส่ง → จัดส่งตามช่องทาง (ไปรษณีย์/อิเล็กทรอนิกส์/นำส่ง)',
    },
    {
      code: 'หมวด 4',
      text: 'การเก็บรักษา: หนังสือที่ปฏิบัติเสร็จแล้วให้เก็บรักษาไว้ไม่น้อยกว่า 10 ปี หนังสือที่ต้องเก็บตลอดไปให้ประทับตรา "ห้ามทำลาย"',
      obligation: 'mandatory',
      action: 'เก็บรักษาอย่างน้อย 10 ปี สำหรับหนังสือทั่วไป หนังสือสำคัญเก็บตลอดไป จัดทำบัญชีหนังสือเก็บรักษา',
    },
    {
      code: 'หมวด 5',
      text: 'การทำลาย: หนังสือเก็บครบกำหนดอายุแล้ว ให้หัวหน้าส่วนราชการแต่งตั้งคณะกรรมการทำลายหนังสือ ดำเนินการสำรวจ จัดทำบัญชี และเสนอขอทำลาย',
      obligation: 'mandatory',
      action: 'แต่งตั้งกรรมการ → สำรวจหนังสือครบอายุ → จัดทำบัญชี → ขออนุมัติ → ทำลาย → รายงาน',
    },
  ];

  for (const c of clauses) {
    await prisma.policyClause.create({
      data: {
        policyItemId: policy1.id,
        clauseCode: c.code,
        clauseText: c.text,
        obligationType: c.obligation,
        actionRequired: c.action,
      },
    });
  }

  console.log(`✅ ระเบียบสารบรรณ พ.ศ. 2526 — ${clauses.length} clauses`);

  // ─── Document + PolicyItem: แนวปฏิบัติ สพฐ. ──────────────────────────────
  const doc2 = await prisma.document.create({
    data: {
      title: 'แนวปฏิบัติงานสารบรรณสำหรับสถานศึกษาในสังกัด สพฐ.',
      sourceType: 'seed',
      documentType: 'guideline',
      sourceChannel: 'system',
      issuingAuthority: 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)',
      trustLevel: 0.95,
      freshnessScore: 0.85,
      publishedAt: new Date('2022-01-15'),
      summaryText: 'คู่มือแนวปฏิบัติงานสารบรรณสำหรับโรงเรียนในสังกัด สพฐ. ครอบคลุมขั้นตอนการรับ-ส่งหนังสือ การจัดเก็บ และการใช้ระบบสารบรรณอิเล็กทรอนิกส์',
    },
  });

  const policy2 = await prisma.policyItem.create({
    data: {
      documentId: doc2.id,
      policyType: 'guideline',
      issuingAuthority: 'สพฐ.',
      jurisdictionLevel: 'national',
      effectiveStatus: 'active',
      mandatoryLevel: 'recommended',
      complianceRiskLevel: 'medium',
      summaryForAction: 'คู่มือปฏิบัติงานสารบรรณโรงเรียน ครอบคลุมบทบาทหน้าที่ ขั้นตอนรับ-ส่ง เก็บรักษา และการใช้ระบบอิเล็กทรอนิกส์',
    },
  });

  const obecClauses = [
    {
      code: 'บทที่ 1',
      text: 'บทบาทหน้าที่งานสารบรรณโรงเรียน: ผู้อำนวยการโรงเรียนเป็นหัวหน้าส่วนราชการ มีอำนาจลงนามหนังสือราชการ มอบหมายเจ้าหน้าที่สารบรรณดูแลระบบทะเบียนรับ-ส่ง',
      obligation: 'mandatory',
      action: 'ผอ. มอบหมายเจ้าหน้าที่สารบรรณ จัดทำคำสั่งมอบหมายงาน กำหนดผู้รับผิดชอบแต่ละขั้นตอน',
    },
    {
      code: 'บทที่ 2',
      text: 'ขั้นตอนการรับหนังสือสำหรับโรงเรียน: รับจากเขตพื้นที่/หน่วยงานภายนอก → ลงทะเบียน → เสนอ ผอ. → สั่งการ → มอบงาน → ติดตาม → เก็บเข้าแฟ้ม',
      obligation: 'mandatory',
      action: 'รับหนังสือ → ลงทะเบียนรับ → เสนอ ผอ. ภายในวัน → ผอ.สั่งการ → แจ้งผู้รับผิดชอบ → ดำเนินการ → รายงาน',
    },
    {
      code: 'บทที่ 3',
      text: 'การใช้ระบบสารบรรณอิเล็กทรอนิกส์: สถานศึกษาสามารถใช้ระบบสารบรรณอิเล็กทรอนิกส์ในการรับ-ส่งหนังสือ โดยต้องจัดเก็บสำเนาเอกสารดิจิทัลตามมาตรฐานที่กำหนด',
      obligation: 'recommended',
      action: 'ใช้ระบบ e-office ในการรับ-ส่ง สแกนเอกสารจัดเก็บ ตั้งค่าการแจ้งเตือนกำหนดส่ง',
    },
  ];

  for (const c of obecClauses) {
    await prisma.policyClause.create({
      data: {
        policyItemId: policy2.id,
        clauseCode: c.code,
        clauseText: c.text,
        obligationType: c.obligation,
        actionRequired: c.action,
      },
    });
  }

  console.log(`✅ แนวปฏิบัติ สพฐ. — ${obecClauses.length} clauses`);

  // ─── Link Topics ──────────────────────────────────────────────────────────
  await prisma.documentTopic.createMany({
    data: [
      { documentId: doc1.id, topicId: topicRoot.id, relevanceScore: 1.0 },
      { documentId: doc1.id, topicId: topicTypes.id, relevanceScore: 1.0 },
      { documentId: doc1.id, topicId: topicReceive.id, relevanceScore: 0.9 },
      { documentId: doc1.id, topicId: topicSend.id, relevanceScore: 0.9 },
      { documentId: doc1.id, topicId: topicStore.id, relevanceScore: 0.9 },
      { documentId: doc1.id, topicId: topicDestroy.id, relevanceScore: 0.9 },
      { documentId: doc2.id, topicId: topicRoot.id, relevanceScore: 1.0 },
      { documentId: doc2.id, topicId: topicReceive.id, relevanceScore: 0.95 },
      { documentId: doc2.id, topicId: topicSend.id, relevanceScore: 0.95 },
    ],
  });

  console.log('✅ Document-Topic links สร้างเสร็จ');

  console.log('\n🎉 Seed สารบรรณพื้นฐานเสร็จสมบูรณ์!');
  console.log(`   Documents: 2`);
  console.log(`   PolicyItems: 2`);
  console.log(`   PolicyClauses: ${clauses.length + obecClauses.length}`);
  console.log(`   Topics: 12`);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function upsertTopic(code: string, nameTh: string, nameEn: string, parentId?: bigint) {
  const existing = await prisma.topic.findUnique({ where: { topicCode: code } });
  if (existing) return existing;
  return prisma.topic.create({
    data: {
      topicCode: code,
      topicNameTh: nameTh,
      topicNameEn: nameEn,
      parentTopicId: parentId,
    },
  });
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
