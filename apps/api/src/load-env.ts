import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

/**
 * คืน path ของ apps/api/.env
 * Nest คอมไพล์ไปที่ dist/src/ ดังนั้น __dirname อาจเป็น .../dist/src
 * — ต้องขึ้นไป 2 ระดับถึงจะถึง apps/api
 */
export function resolveApiRootEnvPath(): string {
  const candidates = [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return path.resolve(p);
    }
  }
  return path.resolve(candidates[candidates.length - 1]);
}

/**
 * โหลด apps/api/.env ก่อน AppModule
 * @nestjs/config รวมค่าเป็น { ...ไฟล์, ...process.env } ทำให้ค่าว่างใน
 * process.env (เช่น ตั้ง GEMINI_API_KEY ไว้ใน Windows) ทับค่าจากไฟล์
 * — ใช้ override: true เพื่อให้ไฟล์เป็นหลัก
 */
const envPath = resolveApiRootEnvPath();
const loaded = config({ path: envPath, override: true });
if (loaded.error && process.env.NODE_ENV !== 'production') {
  console.warn(`[load-env] โหลด .env ไม่สำเร็จ: ${envPath} — ${loaded.error.message}`);
}
