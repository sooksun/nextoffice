/**
 * Backfill script (pure JS — run with node, no TypeScript needed)
 * Classifies response requirement for existing DocumentAiResult records.
 *
 * Usage:
 *   DATABASE_URL=mysql://user:pass@host:3306/db GEMINI_API_KEY=xxx node prisma/backfill-response-classification.js
 *
 * Optional env:
 *   BATCH_SIZE  = records per batch (default 5)
 *   BATCH_DELAY = ms between batches (default 1500)
 *   LIMIT       = max records to process (default unlimited)
 */
require('dotenv').config();

const mysql2 = require('mysql2/promise');
const axios = require('axios');

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const DB_URL = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/nextoffice_db';
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 5;
const DELAY_MS = Number(process.env.BATCH_DELAY) || 1500;
const LIMIT = Number(process.env.LIMIT) || 99999;

if (!GEMINI_KEY) {
  console.error('ERROR: GEMINI_API_KEY is required');
  process.exit(1);
}

function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: u.username,
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
  };
}

async function classify(subject, summary, extracted, actions) {
  const parts = [
    subject   && `หัวเรื่อง: ${subject}`,
    summary   && `สรุป: ${summary}`,
    extracted && `เนื้อหา (excerpt):\n${extracted.substring(0, 2000)}`,
    actions   && `Actions: ${actions}`,
  ].filter(Boolean);

  if (!parts.length) return { responseType: 'unknown', confidence: 0, reason: 'no content' };

  const prompt = `จำแนกหนังสือราชการนี้ว่าต้องการการตอบสนองแบบใด:
- reply_required   : ต้องส่งหนังสือตอบกลับ (ขอความอนุเคราะห์, สอบถาม, เชิญร่วม)
- action_required  : ต้องดำเนินการ ไม่ต้องตอบเป็นหนังสือ (คำสั่งให้ปฏิบัติ)
- report_required  : ต้องรายงานผลกลับ (สั่งให้ดำเนินการแล้วรายงาน)
- informational    : แจ้งเพื่อทราบเท่านั้น ไม่ต้องดำเนินการ

${parts.join('\n\n')}

ตอบเป็น JSON เท่านั้น ห้ามมี markdown หรือข้อความอื่น:
{ "responseType": "reply_required|action_required|report_required|informational", "confidence": 0.0-1.0, "reason": "เหตุผลสั้นๆ" }`;

  try {
    const resp = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
      },
      { timeout: 30000 },
    );

    const raw = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (!['reply_required', 'action_required', 'report_required', 'informational'].includes(parsed.responseType)) {
      return { responseType: 'unknown', confidence: 0, reason: 'invalid responseType: ' + parsed.responseType };
    }
    return parsed;
  } catch (err) {
    return { responseType: 'unknown', confidence: 0, reason: err.message?.substring(0, 100) };
  }
}

async function main() {
  const conn = await mysql2.createConnection(parseDbUrl(DB_URL));
  console.log('Connected to DB');

  const [rows] = await conn.execute(
    `SELECT id, document_intake_id, subject_text, summary_text, extracted_text, next_action_json
     FROM document_ai_results
     WHERE response_type IS NULL
       AND (extracted_text IS NOT NULL OR summary_text IS NOT NULL)
     LIMIT ?`,
    [LIMIT],
  );

  console.log(`Records to classify: ${rows.length}`);
  if (!rows.length) { await conn.end(); return; }

  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (row) => {
      try {
        const result = await classify(
          row.subject_text,
          row.summary_text,
          row.extracted_text,
          row.next_action_json,
        );

        await conn.execute(
          `UPDATE document_ai_results
           SET response_type = ?, response_type_confidence = ?, response_requirement_reason = ?
           WHERE id = ?`,
          [result.responseType, result.confidence ?? null, result.reason ?? null, row.id],
        );

        // Update InboundCase denormalized fields
        const intakeId = row.document_intake_id;
        if (intakeId) {
          const requiresResponse = result.responseType !== 'informational' ? 1 : 0;
          await conn.execute(
            `UPDATE inbound_cases
             SET requires_response = ?, response_type = ?
             WHERE description LIKE ?`,
            [requiresResponse, result.responseType, `%intake:${intakeId}%`],
          );
        }

        ok++;
        const label = (row.subject_text || row.summary_text || '').substring(0, 50);
        console.log(`[${ok + fail}/${rows.length}] ${result.responseType} (conf=${result.confidence?.toFixed(2)}) — ${label}`);
      } catch (err) {
        fail++;
        console.error(`[FAIL] id=${row.id}: ${err.message}`);
      }
    }));

    if (i + BATCH_SIZE < rows.length) {
      process.stdout.write(`  ... waiting ${DELAY_MS}ms ...\n`);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  await conn.end();
  console.log(`\nDone — classified: ${ok}, failed: ${fail}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
