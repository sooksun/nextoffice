/**
 * Knowledge Import Worker — ZERO npm dependencies.
 *
 * Uses ONLY Node.js built-in modules: https, crypto, zlib.
 * This keeps module-loading heap to ~5 MB (vs ~250 MB with axios+minio+pdf-parse).
 *
 * Pipeline (all runs in child process with separate 800 MB V8 heap):
 *   1. Decode base64 file received via IPC from parent
 *   2. OCR via Gemini API (inline base64 for files ≤ 8 MB)
 *   3. Split text into overlapping chunks (mirrors ChunkingService)
 *   4. Embed chunks via Gemini batchEmbedContents API
 *   5. Delete old Qdrant points (retry-safe)
 *   6. Upsert new vectors to Qdrant
 *   7. Send { ok, extractedText, chunkCount } back to parent via IPC
 *   8. process.exit(0) — OS reclaims all memory instantly
 */

'use strict';

const https = require('https');
const { randomUUID } = require('crypto');

const CHUNK_SIZE = 800;    // target tokens (mirrors ChunkingService)
const OVERLAP_CHARS = 150;
const EMBEDDING_MODEL = 'text-embedding-004';
const COLLECTION = 'knowledge';

// ── Entry point ──────────────────────────────────────────────────────────────
// Only listen for IPC messages when running as a forked child process.
// When require()'d from the parent (inline mode), this block is skipped.
if (typeof process.send === 'function') {
  process.on('message', async (msg) => {
    try {
      const result = await processItem(msg);
      process.send({ ok: true, ...result });
    } catch (err) {
      process.send({ ok: false, error: err?.message ?? String(err) });
    } finally {
      process.exit(0);
    }
  });
}

// Export for inline use from parent process (no fork, no IPC overhead)
if (typeof module !== 'undefined') {
  module.exports = { processItem, splitText, embedBatch };
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
async function processItem(msg) {
  const {
    fileBase64, mimeType, sourceType,
    existingText,
    itemId, organizationId, title, category, chunkCount: existingChunkCount,
    geminiApiKey, geminiModel, qdrantUrl,
  } = msg;

  // 1. OCR
  let text = existingText ?? '';
  if (!text) {
    if (!fileBase64) throw new Error('No file content and no existing text');
    const buffer = Buffer.from(fileBase64, 'base64');
    text = await runOcr({ buffer, mimeType, sourceType, geminiApiKey, geminiModel });
  }

  if (!text || text.trim().length < 10) {
    throw new Error('Extracted text too short or empty');
  }

  // 2. Chunk
  const chunks = splitText(text);
  if (chunks.length === 0) throw new Error('No chunks produced from text');

  // 3. Embed all chunks in one batch call
  const vectors = await embedBatch(chunks, geminiApiKey);

  // 4. Build Qdrant points
  const points = [];
  for (let i = 0; i < chunks.length; i++) {
    if (!vectors[i] || vectors[i].length === 0) continue;
    points.push({
      id: randomUUID(),
      vector: vectors[i],
      payload: {
        sourceType: 'user_knowledge',
        itemId: String(itemId),
        organizationId: String(organizationId),
        title: title ?? '',
        category: category ?? '',
        chunkIndex: i,
        text: chunks[i].substring(0, 500),
      },
    });
  }

  // 5. Delete old Qdrant vectors (retry-safe — best effort)
  if (existingChunkCount > 0) {
    await qdrantRequest(qdrantUrl, 'POST',
      `/collections/${COLLECTION}/points/delete`,
      { filter: { must: [{ key: 'itemId', match: { value: String(itemId) } }] } },
    ).catch(() => { /* non-fatal */ });
  }

  // 6. Upsert to Qdrant
  if (points.length > 0) {
    await qdrantRequest(qdrantUrl, 'PUT',
      `/collections/${COLLECTION}/points`,
      { points },
    );
  }

  return { extractedText: text, chunkCount: points.length };
}

// ── Gemini OCR ────────────────────────────────────────────────────────────────
async function runOcr({ buffer, mimeType, sourceType, geminiApiKey, geminiModel }) {
  const prompt = sourceType === 'pdf'
    ? 'สกัดข้อความทั้งหมดจากเอกสาร PDF นี้ให้ครบถ้วน รักษาโครงสร้างและหัวข้อให้ชัดเจน'
    : 'อธิบายและสกัดข้อความทั้งหมดในภาพนี้ ให้ครอบคลุมทุกข้อมูลที่มองเห็น';
  const system = 'คุณคือผู้ช่วย OCR/extraction ที่แม่นยำ ให้ข้อความที่สกัดได้เท่านั้น ไม่ต้องอธิบายเพิ่มเติม';

  const base64 = buffer.toString('base64');
  const body = {
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }] }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
    systemInstruction: { parts: [{ text: system }] },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
  const data = await httpsPost(url, body, { timeout: 120000 });
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Gemini Embedding ──────────────────────────────────────────────────────────
async function embedBatch(texts, apiKey) {
  const BATCH_SIZE = 100;
  const results = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`;
      const body = {
        requests: batch.map(text => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
        })),
      };
      const data = await httpsPost(url, body, { timeout: 60000 });
      const embeddings = data?.embeddings ?? [];
      for (const e of embeddings) results.push(e.values ?? []);
      while (results.length < i + batch.length) results.push([]);
    } catch (_) {
      for (let j = 0; j < batch.length; j++) results.push([]);
    }
  }
  return results;
}

// ── Qdrant via plain HTTP (no library) ───────────────────────────────────────
async function qdrantRequest(qdrantUrl, method, path, body) {
  // qdrantUrl is like "http://qdrant:6333" — use http not https
  const http = require('http');
  const json = JSON.stringify(body);
  const parsed = new URL(qdrantUrl + path);

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port || 6333,
      path: parsed.pathname,
      method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (_) { resolve({}); }
      });
    });
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Qdrant timeout')); });
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

// ── HTTPS helper (replaces axios) ─────────────────────────────────────────────
function httpsPost(url, body, { timeout = 30000 } = {}) {
  const json = JSON.stringify(body);
  const parsed = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(json),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.substring(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error(`Request timed out after ${timeout}ms`)); });
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

// ── Text chunking (mirrors ChunkingService.splitText) ─────────────────────────
function splitText(text) {
  const chunkCharSize = CHUNK_SIZE * 1.5;
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkCharSize, text.length);
    let breakPoint = end;
    if (end < text.length) {
      const sub = text.substring(start, end);
      const lastBreak = Math.max(
        sub.lastIndexOf('\n'), sub.lastIndexOf('ฯ'),
        sub.lastIndexOf('。'), sub.lastIndexOf('. '),
      );
      if (lastBreak > chunkCharSize * 0.5) breakPoint = start + lastBreak + 1;
    }
    chunks.push(text.substring(start, breakPoint).trim());
    start = breakPoint - OVERLAP_CHARS;
    if (start < 0) start = 0;
    if (start >= text.length) break;
  }
  return chunks.filter(c => c.length > 10);
}
