/**
 * Seed script: สร้าง demo data โรงเรียนบ้านพญาไพร
 * Plain JS — ไม่ต้องใช้ ts-node, รันได้ตรงใน Docker container
 *
 * วิธีรัน: docker compose exec api node prisma/seed-school.js
 */
const { PrismaClient } = require('../generated/prisma');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const crypto = require('crypto');

const dbUrl = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/nextoffice_db';
const adapter = new PrismaMariaDb(dbUrl);
const prisma = new PrismaClient({ adapter });

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

const SCHOOL = {
  name: 'โรงเรียนบ้านพญาไพร',
  shortName: 'พญาไพร',
  orgCode: 'PPR',
  orgType: 'school',
  province: 'เชียงราย',
  district: 'แม่ฟ้าหลวง',
  address: '99 หมู่ 1 ต.แม่ฟ้าหลวง อ.แม่ฟ้าหลวง จ.เชียงราย 57240',
};

const STAFF = [
  { fullName: 'นายสุขสันต์ สอนนวล', role: 'DIRECTOR', dept: null, position: 'ผู้อำนวยการโรงเรียน', email: 'suksun@phayaprai.ac.th' },
  { fullName: 'นางสาวพิมพ์ใจ ใจดี', role: 'VICE_DIRECTOR', dept: 'academic', position: 'รองผู้อำนวยการฝ่ายวิชาการ', email: 'pimjai@phayaprai.ac.th' },
  { fullName: 'นายวิชัย แก้วมณี', role: 'VICE_DIRECTOR', dept: 'budget', position: 'รองผู้อำนวยการฝ่ายงบประมาณ', email: 'wichai@phayaprai.ac.th' },
  { fullName: 'นางสาวจารุวรรณ กันทะ', role: 'CLERK', dept: 'general', position: 'เจ้าหน้าที่ธุรการ', email: 'jaruwan@phayaprai.ac.th' },
  { fullName: 'นางแสงเดือน จันทร์ศรี', role: 'HEAD_TEACHER', dept: 'academic', position: 'หัวหน้ากลุ่มสาระภาษาไทย', email: 'sangduen@phayaprai.ac.th' },
  { fullName: 'นายประเสริฐ ศรีสุข', role: 'HEAD_TEACHER', dept: 'academic', position: 'หัวหน้ากลุ่มสาระคณิตศาสตร์', email: 'prasert@phayaprai.ac.th' },
  { fullName: 'นางพรทิพย์ วงศ์สุวรรณ', role: 'HEAD_TEACHER', dept: 'personnel', position: 'หัวหน้างานบุคลากร', email: 'porntip@phayaprai.ac.th' },
  { fullName: 'นายอนุชา สมบัติดี', role: 'HEAD_TEACHER', dept: 'budget', position: 'หัวหน้างานการเงิน', email: 'anucha@phayaprai.ac.th' },
  { fullName: 'นางสาวกิจฤชา สุเตนันต์', role: 'TEACHER', dept: 'academic', position: 'ครูชำนาญการพิเศษ', email: 'kitrucha@phayaprai.ac.th' },
  { fullName: 'นายธนพล ภูมิพันธ์', role: 'TEACHER', dept: 'academic', position: 'ครูชำนาญการ', email: 'thanapol@phayaprai.ac.th' },
  { fullName: 'นางสาวนิภา ศรีวิลัย', role: 'TEACHER', dept: 'academic', position: 'ครูชำนาญการ', email: 'nipa@phayaprai.ac.th' },
  { fullName: 'นายสมชาย เรืองศรี', role: 'TEACHER', dept: 'academic', position: 'ครู คศ.1', email: 'somchai@phayaprai.ac.th' },
  { fullName: 'นางสาวรัตนา แก้วดวงดี', role: 'TEACHER', dept: 'budget', position: 'ครูชำนาญการ', email: 'rattana@phayaprai.ac.th' },
  { fullName: 'นายวันทนา ดวงแก้ว', role: 'TEACHER', dept: 'budget', position: 'ครู คศ.1', email: 'wantana@phayaprai.ac.th' },
  { fullName: 'นางสุพรรณี คำดวงตา', role: 'TEACHER', dept: 'personnel', position: 'ครูชำนาญการ', email: 'supannee@phayaprai.ac.th' },
  { fullName: 'นายจิรายุ ปัญญาดี', role: 'TEACHER', dept: 'personnel', position: 'ครู คศ.1', email: 'jirayu@phayaprai.ac.th' },
  { fullName: 'นางสาววิไล ทองใส', role: 'TEACHER', dept: 'general', position: 'ครูชำนาญการ', email: 'wilai@phayaprai.ac.th' },
  { fullName: 'นายกิตติพงษ์ ชมภูศรี', role: 'TEACHER', dept: 'general', position: 'ครู คศ.1', email: 'kittipong@phayaprai.ac.th' },
  { fullName: 'นางสาวจันทร์จิรา แสนสุข', role: 'TEACHER', dept: 'general', position: 'ครู คศ.1', email: 'janjira@phayaprai.ac.th' },
  { fullName: 'นายสุรเดช ไกรศรี', role: 'TEACHER', dept: 'academic', position: 'ครูผู้ช่วย', email: 'suradet@phayaprai.ac.th' },
];

const WORK_GROUPS = [
  {
    code: 'academic', name: 'กลุ่มงานวิชาการ',
    description: 'งานบริหารวิชาการ หลักสูตร การจัดการเรียนรู้ วัดผล', sortOrder: 1,
    functions: [
      { code: 'AC01', name: 'งานพัฒนาหลักสูตรสถานศึกษา', description: 'จัดทำและพัฒนาหลักสูตรสถานศึกษา' },
      { code: 'AC02', name: 'งานจัดการเรียนรู้', description: 'จัดตารางสอน แผนการสอน สื่อการเรียนรู้' },
      { code: 'AC03', name: 'งานวัดผลและประเมินผล', description: 'การสอบ ประเมินผล จัดทำ ปพ.' },
      { code: 'AC04', name: 'งานทะเบียนนักเรียน', description: 'รับนักเรียน ย้าย ลาออก ทะเบียนนักเรียน' },
      { code: 'AC05', name: 'งานห้องสมุด', description: 'บริหารห้องสมุด สื่อ แหล่งเรียนรู้' },
      { code: 'AC06', name: 'งานแนะแนว', description: 'แนะแนวการศึกษาต่อ อาชีพ ดูแลช่วยเหลือนักเรียน' },
      { code: 'AC07', name: 'งานนิเทศภายใน', description: 'นิเทศการสอน ติดตาม ประเมินครู' },
      { code: 'AC08', name: 'งานประกันคุณภาพภายใน', description: 'ระบบประกันคุณภาพ SAR มาตรฐาน' },
      { code: 'AC09', name: 'งานพัฒนาสื่อเทคโนโลยี', description: 'ICT สื่อนวัตกรรม เทคโนโลยีการศึกษา' },
      { code: 'AC10', name: 'งานวิจัยในชั้นเรียน', description: 'ส่งเสริมการวิจัยของครู นวัตกรรมการสอน' },
    ],
  },
  {
    code: 'budget', name: 'กลุ่มงานงบประมาณ',
    description: 'งานบริหารงบประมาณ การเงิน พัสดุ', sortOrder: 2,
    functions: [
      { code: 'BG01', name: 'งานจัดทำแผนงบประมาณ', description: 'จัดทำแผนงบประมาณประจำปี' },
      { code: 'BG02', name: 'งานการเงินและบัญชี', description: 'รับ-จ่ายเงิน จัดทำบัญชี รายงานการเงิน' },
      { code: 'BG03', name: 'งานพัสดุและสินทรัพย์', description: 'จัดซื้อจัดจ้าง ทะเบียนพัสดุ ครุภัณฑ์' },
      { code: 'BG04', name: 'งานตรวจสอบภายใน', description: 'ตรวจสอบการเงิน พัสดุ ระบบควบคุม' },
      { code: 'BG05', name: 'งานระดมทรัพยากร', description: 'ระดมทุน ทรัพยากรจากชุมชน ภาคเอกชน' },
    ],
  },
  {
    code: 'personnel', name: 'กลุ่มงานบุคลากร',
    description: 'งานบริหารงานบุคคล สวัสดิการ พัฒนาบุคลากร', sortOrder: 3,
    functions: [
      { code: 'PS01', name: 'งานวางแผนอัตรากำลัง', description: 'จัดทำแผนอัตรากำลัง สรรหา บรรจุ แต่งตั้ง' },
      { code: 'PS02', name: 'งานทะเบียนประวัติ', description: 'ทะเบียนประวัติบุคลากร ก.พ.7 ก.ค.ศ.16' },
      { code: 'PS03', name: 'งานพัฒนาบุคลากร', description: 'อบรม สัมมนา ศึกษาดูงาน พัฒนาวิชาชีพ' },
      { code: 'PS04', name: 'งานวินัยและนิติการ', description: 'วินัย การลงโทษ อุทธรณ์ ร้องทุกข์' },
      { code: 'PS05', name: 'งานเลื่อนเงินเดือน', description: 'ประเมินผลงาน เลื่อนเงินเดือน ค่าตอบแทน' },
      { code: 'PS06', name: 'งานสวัสดิการ', description: 'สวัสดิการ สิทธิประโยชน์ บำเหน็จบำนาญ' },
    ],
  },
  {
    code: 'general', name: 'กลุ่มงานทั่วไป',
    description: 'งานบริหารทั่วไป อาคารสถานที่ สารบรรณ ชุมชนสัมพันธ์', sortOrder: 4,
    functions: [
      { code: 'GN01', name: 'งานสารบรรณ', description: 'รับ-ส่งหนังสือ จัดเก็บเอกสาร ทะเบียนหนังสือ' },
      { code: 'GN02', name: 'งานอาคารสถานที่', description: 'ดูแลอาคาร ซ่อมบำรุง ภูมิทัศน์' },
      { code: 'GN03', name: 'งานประชาสัมพันธ์', description: 'ประชาสัมพันธ์ สื่อสาร ภาพลักษณ์โรงเรียน' },
      { code: 'GN04', name: 'งานชุมชนสัมพันธ์', description: 'ความสัมพันธ์ชุมชน เครือข่ายผู้ปกครอง' },
      { code: 'GN05', name: 'งานสุขอนามัย', description: 'อนามัยโรงเรียน โภชนาการ อาหารกลางวัน' },
      { code: 'GN06', name: 'งานกิจการนักเรียน', description: 'ระบบดูแลช่วยเหลือ กิจกรรมนักเรียน ลูกเสือ' },
      { code: 'GN07', name: 'งานยานพาหนะ', description: 'ยานพาหนะ รถรับ-ส่ง การเดินทาง' },
      { code: 'GN08', name: 'งานป้องกันยาเสพติด', description: 'ป้องกันและแก้ไขปัญหายาเสพติด' },
      { code: 'GN09', name: 'งานควบคุมภายใน', description: 'ระบบควบคุมภายใน ประเมินความเสี่ยง' },
    ],
  },
];

// มอบหมายงาน: fnCode → [[staffIndex, role], ...]
const ASSIGNMENTS = {
  AC01: [[1, 'head'], [5, 'responsible'], [8, 'assistant']],
  AC02: [[5, 'head'], [9, 'responsible'], [10, 'assistant']],
  AC03: [[4, 'head'], [11, 'responsible']],
  AC04: [[3, 'head'], [8, 'responsible']],
  AC05: [[10, 'head'], [19, 'assistant']],
  AC06: [[9, 'head'], [11, 'responsible']],
  AC07: [[1, 'head'], [4, 'responsible'], [5, 'responsible']],
  AC08: [[1, 'head'], [8, 'responsible'], [19, 'assistant']],
  AC09: [[9, 'head'], [19, 'responsible']],
  AC10: [[4, 'head'], [10, 'responsible'], [11, 'assistant']],
  BG01: [[2, 'head'], [7, 'responsible']],
  BG02: [[7, 'head'], [12, 'responsible']],
  BG03: [[12, 'head'], [13, 'responsible']],
  BG04: [[2, 'head'], [13, 'responsible']],
  BG05: [[7, 'head'], [12, 'responsible'], [13, 'assistant']],
  PS01: [[6, 'head'], [14, 'responsible']],
  PS02: [[3, 'head'], [15, 'responsible']],
  PS03: [[6, 'head'], [15, 'responsible'], [14, 'assistant']],
  PS04: [[0, 'head'], [6, 'responsible']],
  PS05: [[6, 'head'], [14, 'responsible']],
  PS06: [[14, 'head'], [15, 'responsible']],
  GN01: [[3, 'head'], [16, 'responsible']],
  GN02: [[17, 'head'], [18, 'responsible']],
  GN03: [[16, 'head'], [18, 'assistant']],
  GN04: [[16, 'head'], [17, 'responsible']],
  GN05: [[18, 'head'], [16, 'assistant']],
  GN06: [[17, 'head'], [15, 'responsible'], [18, 'assistant']],
  GN07: [[17, 'head']],
  GN08: [[18, 'head'], [17, 'responsible']],
  GN09: [[3, 'head'], [16, 'responsible']],
};

async function main() {
  console.log('🏫 เริ่มสร้าง demo data โรงเรียนบ้านพญาไพร...\n');

  // 1. Academic Year
  console.log('📅 สร้างปีการศึกษา...');
  const ay2568 = await prisma.academicYear.upsert({
    where: { year: 2568 },
    update: {},
    create: { year: 2568, name: 'ปีการศึกษา 2568', startDate: new Date('2025-05-16'), endDate: new Date('2026-03-31'), isCurrent: false },
  });
  const ay2569 = await prisma.academicYear.upsert({
    where: { year: 2569 },
    update: {},
    create: { year: 2569, name: 'ปีการศึกษา 2569', startDate: new Date('2026-05-16'), endDate: new Date('2027-03-31'), isCurrent: true },
  });
  console.log(`   ✅ 2568 (id=${ay2568.id}), 2569 (id=${ay2569.id})`);

  // 2. Organization
  console.log('\n🏫 สร้างโรงเรียน...');
  let org = await prisma.organization.findFirst({ where: { orgCode: SCHOOL.orgCode } });
  if (!org) {
    org = await prisma.organization.create({ data: SCHOOL });
  }
  console.log(`   ✅ ${org.name} (id=${org.id})`);

  // 3. Users
  console.log('\n👥 สร้างบุคลากร 20 คน...');
  const defaultPw = await hashPassword('Teacher@123');
  const userIds = [];

  for (const s of STAFF) {
    let user = await prisma.user.findUnique({ where: { email: s.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: s.email,
          passwordHash: defaultPw,
          fullName: s.fullName,
          roleCode: s.role,
          organizationId: org.id,
          positionTitle: s.position,
          department: s.dept,
          isActive: true,
        },
      });
    }
    userIds.push(user.id);
    console.log(`   ✅ ${s.fullName} (${s.role})`);
  }

  // 4. WorkGroups + WorkFunctions
  console.log('\n📂 สร้าง 4 ฝ่าย + งานย่อย...');
  const functionMap = {};

  for (const wg of WORK_GROUPS) {
    let group = await prisma.workGroup.findFirst({ where: { organizationId: org.id, code: wg.code } });
    if (!group) {
      group = await prisma.workGroup.create({
        data: { organizationId: org.id, code: wg.code, name: wg.name, description: wg.description, sortOrder: wg.sortOrder },
      });
    }
    console.log(`   📁 ${wg.name}`);

    for (const fn of wg.functions) {
      let func = await prisma.workFunction.findFirst({ where: { workGroupId: group.id, code: fn.code } });
      if (!func) {
        func = await prisma.workFunction.create({
          data: { workGroupId: group.id, code: fn.code, name: fn.name, description: fn.description },
        });
      }
      functionMap[fn.code] = func.id;
      console.log(`      📋 ${fn.name}`);
    }
  }

  // 5. Staff Assignments
  console.log('\n📌 มอบหมายงาน...');
  let assignCount = 0;

  for (const [fnCode, assignments] of Object.entries(ASSIGNMENTS)) {
    const funcId = functionMap[fnCode];
    if (!funcId) continue;

    for (const [staffIdx, role] of assignments) {
      const userId = userIds[staffIdx];
      if (!userId) continue;

      const existing = await prisma.staffAssignment.findFirst({
        where: { organizationId: org.id, userId, workFunctionId: funcId, academicYearId: ay2569.id },
      });
      if (!existing) {
        await prisma.staffAssignment.create({
          data: {
            organizationId: org.id, userId, workFunctionId: funcId,
            academicYearId: ay2569.id, role, semester: 0,
            effectiveDate: new Date('2026-05-16'), isActive: true,
          },
        });
        assignCount++;
      }
    }
  }
  console.log(`   ✅ มอบหมายงานแล้ว ${assignCount} รายการ`);

  // 6. Link users to primary workGroup
  console.log('\n🔗 ผูกครูกับฝ่ายหลัก...');
  const deptToGroup = {};
  for (const wg of WORK_GROUPS) {
    const group = await prisma.workGroup.findFirst({ where: { organizationId: org.id, code: wg.code } });
    if (group) deptToGroup[wg.code] = group.id;
  }
  for (let i = 0; i < STAFF.length; i++) {
    if (STAFF[i].dept && deptToGroup[STAFF[i].dept]) {
      await prisma.user.update({ where: { id: userIds[i] }, data: { workGroupId: deptToGroup[STAFF[i].dept] } });
    }
  }

  console.log(`
╔══════════════════════════════════════════╗
║  🎉 สร้าง Demo Data สำเร็จ!              ║
╠══════════════════════════════════════════╣
║  🏫 โรงเรียนบ้านพญาไพร                   ║
║  👥 บุคลากร: 20 คน                       ║
║  📂 กลุ่มงาน: 4 ฝ่าย                      ║
║  📋 งานย่อย: ${String(Object.keys(functionMap).length).padEnd(2)} งาน                      ║
║  📌 มอบหมาย: ${String(assignCount).padEnd(2)} รายการ                   ║
╠══════════════════════════════════════════╣
║  🔑 Password ทุกคน: Teacher@123          ║
║  🔑 ผอ.: suksun@phayaprai.ac.th          ║
║  🔑 ธุรการ: jaruwan@phayaprai.ac.th      ║
╚══════════════════════════════════════════╝
`);
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
