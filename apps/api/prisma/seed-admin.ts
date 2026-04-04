/**
 * Seed script: สร้าง admin user คนแรก
 * วิธีรัน: npx ts-node prisma/seed-admin.ts
 */
import { PrismaClient } from '../generated/prisma';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

async function main() {
  const email = 'admin@nextoffice.go.th';
  const password = 'Admin@123';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✅ Admin user already exists: ${email}`);
    return;
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: 'ผู้ดูแลระบบ',
      roleCode: 'ADMIN',
    },
  });

  console.log(`✅ Admin user created:`);
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   ID: ${user.id}`);
  console.log(`\n⚠️  กรุณาเปลี่ยนรหัสผ่านหลังจากเข้าสู่ระบบครั้งแรก`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
