/**
 * Seed script: สร้าง demo data โรงเรียนบ้านพญาไพร
 * ใช้ mysql2 ตรง (ไม่ต้องพึ่ง Prisma client / ts-node)
 * รันใน Docker: docker compose exec api node prisma/seed-school.js
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const DB_URL = process.env.DATABASE_URL || 'mysql://root:@192.168.1.4:3306/nextoffice_db';

function parseDbUrl(url) {
  const m = url.match(/mysql:\/\/([^:]*):([^@]*)@([^:]*):(\d+)\/(.+)/);
  if (!m) throw new Error('Invalid DATABASE_URL: ' + url);
  return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4]), database: m[5] };
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      resolve(`${salt}:${key.toString('hex')}`);
    });
  });
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SCHOOL = {
  name: 'โรงเรียนบ้านพญาไพร',
  short_name: 'พญาไพร',
  org_code: 'PPR',
  org_type: 'school',
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
  { code: 'academic', name: 'กลุ่มงานวิชาการ', description: 'งานบริหารวิชาการ หลักสูตร การจัดการเรียนรู้ วัดผล', sortOrder: 1, functions: [
    { code: 'AC01', name: 'งานพัฒนาหลักสูตรสถานศึกษา' }, { code: 'AC02', name: 'งานจัดการเรียนรู้' },
    { code: 'AC03', name: 'งานวัดผลและประเมินผล' }, { code: 'AC04', name: 'งานทะเบียนนักเรียน' },
    { code: 'AC05', name: 'งานห้องสมุด' }, { code: 'AC06', name: 'งานแนะแนว' },
    { code: 'AC07', name: 'งานนิเทศภายใน' }, { code: 'AC08', name: 'งานประกันคุณภาพภายใน' },
    { code: 'AC09', name: 'งานพัฒนาสื่อเทคโนโลยี' }, { code: 'AC10', name: 'งานวิจัยในชั้นเรียน' },
  ]},
  { code: 'budget', name: 'กลุ่มงานงบประมาณ', description: 'งานบริหารงบประมาณ การเงิน พัสดุ', sortOrder: 2, functions: [
    { code: 'BG01', name: 'งานจัดทำแผนงบประมาณ' }, { code: 'BG02', name: 'งานการเงินและบัญชี' },
    { code: 'BG03', name: 'งานพัสดุและสินทรัพย์' }, { code: 'BG04', name: 'งานตรวจสอบภายใน' },
    { code: 'BG05', name: 'งานระดมทรัพยากร' },
  ]},
  { code: 'personnel', name: 'กลุ่มงานบุคลากร', description: 'งานบริหารงานบุคคล สวัสดิการ พัฒนาบุคลากร', sortOrder: 3, functions: [
    { code: 'PS01', name: 'งานวางแผนอัตรากำลัง' }, { code: 'PS02', name: 'งานทะเบียนประวัติ' },
    { code: 'PS03', name: 'งานพัฒนาบุคลากร' }, { code: 'PS04', name: 'งานวินัยและนิติการ' },
    { code: 'PS05', name: 'งานเลื่อนเงินเดือน' }, { code: 'PS06', name: 'งานสวัสดิการ' },
  ]},
  { code: 'general', name: 'กลุ่มงานทั่วไป', description: 'งานบริหารทั่วไป อาคารสถานที่ สารบรรณ ชุมชนสัมพันธ์', sortOrder: 4, functions: [
    { code: 'GN01', name: 'งานสารบรรณ' }, { code: 'GN02', name: 'งานอาคารสถานที่' },
    { code: 'GN03', name: 'งานประชาสัมพันธ์' }, { code: 'GN04', name: 'งานชุมชนสัมพันธ์' },
    { code: 'GN05', name: 'งานสุขอนามัย' }, { code: 'GN06', name: 'งานกิจการนักเรียน' },
    { code: 'GN07', name: 'งานยานพาหนะ' }, { code: 'GN08', name: 'งานป้องกันยาเสพติด' },
    { code: 'GN09', name: 'งานควบคุมภายใน' },
  ]},
];

const ASSIGN_MAP = {
  AC01: [[1,'head'],[5,'responsible'],[8,'assistant']], AC02: [[5,'head'],[9,'responsible'],[10,'assistant']],
  AC03: [[4,'head'],[11,'responsible']], AC04: [[3,'head'],[8,'responsible']],
  AC05: [[10,'head'],[19,'assistant']], AC06: [[9,'head'],[11,'responsible']],
  AC07: [[1,'head'],[4,'responsible'],[5,'responsible']], AC08: [[1,'head'],[8,'responsible'],[19,'assistant']],
  AC09: [[9,'head'],[19,'responsible']], AC10: [[4,'head'],[10,'responsible'],[11,'assistant']],
  BG01: [[2,'head'],[7,'responsible']], BG02: [[7,'head'],[12,'responsible']],
  BG03: [[12,'head'],[13,'responsible']], BG04: [[2,'head'],[13,'responsible']],
  BG05: [[7,'head'],[12,'responsible'],[13,'assistant']],
  PS01: [[6,'head'],[14,'responsible']], PS02: [[3,'head'],[15,'responsible']],
  PS03: [[6,'head'],[15,'responsible'],[14,'assistant']], PS04: [[0,'head'],[6,'responsible']],
  PS05: [[6,'head'],[14,'responsible']], PS06: [[14,'head'],[15,'responsible']],
  GN01: [[3,'head'],[16,'responsible']], GN02: [[17,'head'],[18,'responsible']],
  GN03: [[16,'head'],[18,'assistant']], GN04: [[16,'head'],[17,'responsible']],
  GN05: [[18,'head'],[16,'assistant']], GN06: [[17,'head'],[15,'responsible'],[18,'assistant']],
  GN07: [[17,'head']], GN08: [[18,'head'],[17,'responsible']], GN09: [[3,'head'],[16,'responsible']],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function upsertRow(conn, table, uniqueWhere, data) {
  const [rows] = await conn.execute(
    `SELECT id FROM ${table} WHERE ${Object.keys(uniqueWhere).map(k => `${k} = ?`).join(' AND ')} LIMIT 1`,
    Object.values(uniqueWhere),
  );
  if (rows.length > 0) return rows[0].id;

  const allData = { ...uniqueWhere, ...data };
  const cols = Object.keys(allData);
  const placeholders = cols.map(() => '?').join(', ');
  const [result] = await conn.execute(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
    Object.values(allData),
  );
  return result.insertId;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dbConf = parseDbUrl(DB_URL);
  console.log(`🔌 Connecting to ${dbConf.host}:${dbConf.port}/${dbConf.database}...`);
  const conn = await mysql.createConnection({ ...dbConf, charset: 'utf8mb4' });
  console.log('   ✅ Connected\n');

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // 1. Academic Years
  console.log('📅 ปีการศึกษา...');
  const ay2568 = await upsertRow(conn, 'academic_years', { year: 2568 }, {
    name: 'ปีการศึกษา 2568', start_date: '2025-05-16', end_date: '2026-03-31', is_current: 0, created_at: now,
  });
  const ay2569 = await upsertRow(conn, 'academic_years', { year: 2569 }, {
    name: 'ปีการศึกษา 2569', start_date: '2026-05-16', end_date: '2027-03-31', is_current: 1, created_at: now,
  });
  console.log(`   ✅ 2568 (id=${ay2568}), 2569 (id=${ay2569})`);

  // 2. Organization
  console.log('\n🏫 โรงเรียน...');
  const orgId = await upsertRow(conn, 'organizations', { org_code: SCHOOL.org_code }, {
    name: SCHOOL.name, short_name: SCHOOL.short_name, org_type: SCHOOL.org_type,
    province: SCHOOL.province, district: SCHOOL.district, address: SCHOOL.address,
    is_active: 1, created_at: now, updated_at: now,
  });
  console.log(`   ✅ ${SCHOOL.name} (id=${orgId})`);

  // 3. Users
  console.log('\n👥 บุคลากร 20 คน...');
  const pw = await hashPassword('Teacher@123');
  const userIds = [];

  for (const s of STAFF) {
    const uid = await upsertRow(conn, 'users', { email: s.email }, {
      password_hash: pw, full_name: s.fullName, role_code: s.role,
      organization_id: orgId, position_title: s.position, department: s.dept,
      is_active: 1, created_at: now, updated_at: now,
    });
    userIds.push(uid);
    console.log(`   ✅ ${s.fullName} (${s.role})`);
  }

  // 4. WorkGroups + WorkFunctions
  console.log('\n📂 4 ฝ่าย + งานย่อย...');
  const fnMap = {}; // code → id
  const groupIdMap = {}; // groupCode → id

  for (const wg of WORK_GROUPS) {
    const gid = await upsertRow(conn, 'work_groups', { organization_id: orgId, code: wg.code }, {
      name: wg.name, description: wg.description, sort_order: wg.sortOrder, is_active: 1, created_at: now,
    });
    groupIdMap[wg.code] = gid;
    console.log(`   📁 ${wg.name} (id=${gid})`);

    for (const fn of wg.functions) {
      const fid = await upsertRow(conn, 'work_functions', { work_group_id: gid, code: fn.code }, {
        name: fn.name, description: fn.name, sort_order: 0, is_active: 1, created_at: now,
      });
      fnMap[fn.code] = fid;
      console.log(`      📋 ${fn.name}`);
    }
  }

  // 5. Staff Assignments
  console.log('\n📌 มอบหมายงาน...');
  let cnt = 0;
  for (const [fnCode, assigns] of Object.entries(ASSIGN_MAP)) {
    const fid = fnMap[fnCode];
    if (!fid) continue;
    for (const [idx, role] of assigns) {
      const uid = userIds[idx];
      if (!uid) continue;
      const [existing] = await conn.execute(
        'SELECT id FROM staff_assignments WHERE organization_id=? AND user_id=? AND work_function_id=? AND academic_year_id=? LIMIT 1',
        [orgId, uid, fid, ay2569],
      );
      if (existing.length === 0) {
        await conn.execute(
          'INSERT INTO staff_assignments (organization_id, user_id, work_function_id, academic_year_id, role, semester, effective_date, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [orgId, uid, fid, ay2569, role, 0, '2026-05-16', 1, now, now],
        );
        cnt++;
      }
    }
  }
  console.log(`   ✅ มอบหมาย ${cnt} รายการ`);

  // 6. Link users → primary workGroup
  console.log('\n🔗 ผูกครูกับฝ่าย...');
  for (let i = 0; i < STAFF.length; i++) {
    const dept = STAFF[i].dept;
    if (dept && groupIdMap[dept]) {
      await conn.execute('UPDATE users SET work_group_id=? WHERE id=?', [groupIdMap[dept], userIds[i]]);
    }
  }

  console.log(`
╔══════════════════════════════════════════╗
║  🎉 สร้าง Demo Data สำเร็จ!              ║
╠══════════════════════════════════════════╣
║  🏫 โรงเรียนบ้านพญาไพร                   ║
║  👥 บุคลากร: 20 คน                       ║
║  📂 กลุ่มงาน: 4 ฝ่าย                      ║
║  📋 งานย่อย: ${String(Object.keys(fnMap).length).padEnd(2)} งาน                      ║
║  📌 มอบหมาย: ${String(cnt).padEnd(2)} รายการ                   ║
╠══════════════════════════════════════════╣
║  🔑 Password ทุกคน: Teacher@123          ║
║  🔑 ผอ.: suksun@phayaprai.ac.th          ║
║  🔑 ธุรการ: jaruwan@phayaprai.ac.th      ║
╚══════════════════════════════════════════╝
`);

  await conn.end();
}

main().catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); });
