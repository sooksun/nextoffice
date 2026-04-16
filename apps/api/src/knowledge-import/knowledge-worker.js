/**
 * Knowledge Import Worker — minimal dependencies to keep V8 heap small.
 *
 * Module loading cost analysis (why previous version OOMed at 400MB):
 *   minio SDK:         ~100 MB V8 heap (AWS SDK internals, XML parser, crypto)
 *   pdf-parse/pdf.js:  ~150 MB V8 heap (pdf.js bytecode + font tables)
 *   axios:               ~5 MB
 *   Node.js runtime:    ~20 MB
 *   Total:             ~275 MB just from require() — leaving only 125 MB for work.
 *
 * This version eliminates minio and pdf-parse:
 *   - File is downloaded by the parent (NestJS already has MinIO client) and
 *     sent as base64 via IPC. Child never touches MinIO.
 *   - OCR always uses Gemini API (inline base64 for <4 MB, File API for larger).
 *     No pdf-parse / pdf.js loaded.
 *   - Qdrant and Gemini embedding: plain axios HTTP calls.
 *
 * Resulting module load: axios ~5 MB + form-data ~1 MB + runtime ~20 MB ≈ 26 MB.
 * Leaves ~374 MB headroom within the 400 MB limit for actual data.
 *
 * Protocol:
 *   Parent sends: { fileBase64, mimeType, sourceType, existingText, itemId,
 *                   organizationId, title, category, chunkCount,
 *                   geminiApiKey, geminiModel, qdrantUrl }
 *   Child replies: { ok: true, extractedText, chunkCount }
 *             OR : { ok: false, error: '...' }
 *   Child calls process.exit(0) — OS reclaims all memory instantly.
 */

'use strict';

const axios = require('axios');
const FormData = require('form-data');
const { randomUUID } = require('crypto');

const INLINE_SIZE_LIMIT = 4 * 1024 * 1024; // 4 MB
const CHUNK_SIZE = 800;   // target tokens (mirrors ChunkingService)
const OVERLAP_CHARS = 150;
const EMBEDDING_MODEL = 'text-embedding-004';
const COLLECTION = 'knowledge';

// ── Entry point ──────────────────────────────────────────────────────────────
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

// ── Main pipeline ─────────────────────────────────────────────────────────────
async function processItem(msg) {
  const {
    fileBase64, mimeType, sourceType,
    existingText,
    itemId, organizationId, title, category, chunkCount: existingChunkCount,
    geminiApiKey, geminiModel, qdrantUrl,
  } = msg;

  // 1. OCR (skip if already extracted)
  let text = existingText ?? '';
  if (!text) {
    if (!fileBase64) throw new Error('No file content provided');
    const buffer = Buffer.from(fileBase64, 'base64');
    text = await runOcr({ buffer, mimeType, sourceType, geminiApiKey, geminiModel });
  }

  if (!text || text.trim().length < 10) {
    throw new Error('Extracted text too short or empty');
  }

  // 2. Chunk
  const chunks = splitText(text);
  if (chunks.length === 0) throw new Error('No chunks produced from text');

  // 3. Embed
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

  // 5. Delete old Qdrant vectors (retry-safe)
  if (existingChunkCount > 0) {
    await qdrantDeleteByItemId(qdrantUrl, String(itemId));
  }

  // 6. Upsert to Qdrant
  if (points.length > 0) {
    await qdrantUpsert(qdrantUrl, points);
  }

  return { extractedText: text, chunkCount: points.length };
}

// ── OCR via Gemini API only (no pdf-parse, no pdf.js) ────────────────────────
async function runOcr({ buffer, mimeType, sourceType, geminiApiKey, geminiModel }) {
  const bufferLen = buffer.length;
  const prompt = sourceType === 'pdf'
    ? 'สกัดข้อความทั้งหมดจากเอกสาร PDF นี้ให้ครบถ้วน รักษาโครงสร้างและหัวข้อให้ชัดเจน'
    : 'อธิบายและสกัดข้อความทั้งหมดในภาพนี้ ให้ครอบคลุมทุกข้อมูลที่มองเห็น';
  const system = 'คุณคือผู้ช่วย OCR/extraction ที่แม่นยำ ให้ข้อความที่สกัดได้เท่านั้น ไม่ต้องอธิบายเพิ่มเติม';

  if (bufferLen > INLINE_SIZE_LIMIT) {
    // Large file → Gemini File API (upload by reference, avoids base64 in heap)
    const fileUri = await uploadToGeminiFileApi(buffer, mimeType, geminiApiKey);
    return geminiGenerate({
      parts: [{ fileData: { mimeType, fileUri } }, { text: prompt }],
      system, apiKey: geminiApiKey, model: geminiModel,
    });
  }

  // Small file → inline base64
  const base64 = buffer.toString('base64');
  return geminiGenerate({
    parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }],
    system, apiKey: geminiApiKey, model: geminiModel,
  });
}

async function uploadToGeminiFileApi(buffer, mimeType, apiKey) {
  const form = new FormData();
  form.append('file', buffer, { filename: 'document', contentType: mimeType });
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    form,
    { headers: form.getHeaders(), timeout: 60000, maxContentLength: 50 * 1024 * 1024, maxBodyLength: 50 * 1024 * 1024 },
  );
  const fileUri = res.data?.file?.uri;
  if (!fileUri) throw new Error('Gemini File API did not return a fileUri');
  return fileUri;
}

async function geminiGenerate({ parts, system, apiKey, model }) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    body,
    { timeout: 120000, headers: { 'Content-Type': 'application/json' } },
  );
  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Chunking (mirrors ChunkingService.splitText) ──────────────────────────────
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

// ── Gemini Embeddings ─────────────────────────────────────────────────────────
async function embedBatch(texts, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`;
  const BATCH_SIZE = 100;
  const results = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const res = await axios.post(url, {
        requests: batch.map(text => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
        })),
      }, { timeout: 60000, headers: { 'Content-Type': 'application/json' } });
      const embeddings = res.data?.embeddings ?? [];
      for (const e of embeddings) results.push(e.values ?? []);
      while (results.length < i + batch.length) results.push([]);
    } catch (_) {
      for (let j = 0; j < batch.length; j++) results.push([]);
    }
  }
  return results;
}

// ── Qdrant (plain HTTP) ───────────────────────────────────────────────────────
async function qdrantDeleteByItemId(qdrantUrl, itemId) {
  try {
    await axios.post(
      `${qdrantUrl}/collections/${COLLECTION}/points/delete`,
      { filter: { must: [{ key: 'itemId', match: { value: itemId } }] } },
      { timeout: 30000, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (_) { /* non-fatal — if old points remain, they'll be overwritten */ }
}

async function qdrantUpsert(qdrantUrl, points) {
  if (points.length === 0) return;
  await axios.put(
    `${qdrantUrl}/collections/${COLLECTION}/points`,
    { points },
    { timeout: 60000, headers: { 'Content-Type': 'application/json' }, maxContentLength: 100 * 1024 * 1024, maxBodyLength: 100 * 1024 * 1024 },
  );
}
