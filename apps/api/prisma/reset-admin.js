const crypto = require('crypto');
const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

async function main() {
  const email = 'admin@nextoffice.go.th';
  const password = 'Admin@123';
  const passwordHash = await hashPassword(password);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { email }, data: { passwordHash, isActive: true } });
    console.log('Updated password for:', email);
  } else {
    const org = await prisma.organization.findFirst();
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: 'Administrator',
        roleCode: 'ADMIN',
        isActive: true,
        organizationId: org ? org.id : null,
      },
    });
    console.log('Created admin user:', email);
  }
  console.log('Password:', password);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
