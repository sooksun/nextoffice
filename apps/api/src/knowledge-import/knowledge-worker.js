/**
 * Knowledge Import Worker — runs ALL heavy work in a child process.
 *
 * The NestJS parent process (88 MB baseline DI container) cannot safely
 * run OCR + chunking + embedding + Qdrant in the same V8 heap without OOM.
 *
 * This worker runs in a separate child_process.fork() with its own heap.
 * It does:
 *   1. Download file from MinIO
 *   2. OCR (pdf-parse → Gemini fallback for scanned PDFs/images)
 *   3. Chunk text (same params as ChunkingService)
 *   4. Embed chunks via Gemini batchEmbedContents API
 *   5. Delete old Qdrant points (if item had previous chunks)
 *   6. Upsert new points to Qdrant
 *
 * Parent receives: { ok: true, extractedText, chunkCount }
 *              OR: { ok: false, error: '...' }
 * Then exits: process.exit(0) — OS reclaims all memory instantly.
 */

'use strict';

const Minio = require('minio');
const axios = require('axios');
const FormData = require('form-data');
const { randomUUID } = require('crypto');
const pdfParse = require('pdf-parse');

// ── Constants (mirror ChunkingService) ──────────────────────────────────────
const INLINE_SIZE_LIMIT = 2 * 1024 * 1024; // 2 MB
const CHUNK_SIZE = 800;   // target tokens
const OVERLAP_CHARS = 150;
const EMBEDDING_MODEL = 'text-embedding-004';
const COLLECTION = 'knowledge';

// ── Entry point ─────────────────────────────────────────────────────────────
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

// ── Main pipeline ────────────────────────────────────────────────────────────
async function processItem(msg) {
  const {
    storagePath, mimeType, sourceType,
    extractedText: existingText,
    itemId, organizationId, title, category, chunkCount: existingChunkCount,
    minioConfig, geminiApiKey, geminiModel, qdrantUrl,
  } = msg;

  // 1. OCR (skip if text already extracted)
  let text = existingText ?? '';
  if (!text && storagePath) {
    const buffer = await getBuffer(minioConfig, storagePath);
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

  // 5. Delete old Qdrant vectors (prevents duplication on retry)
  if (existingChunkCount > 0) {
    await qdrantDeleteByItemId(qdrantUrl, String(itemId));
  }

  // 6. Upsert to Qdrant
  if (points.length > 0) {
    await qdrantUpsert(qdrantUrl, points);
  }

  return { extractedText: text, chunkCount: points.length };
}

// ── MinIO ─────────────────────────────────────────────────────────────────────
async function getBuffer(minioConfig, storagePath) {
  const client = new Minio.Client({
    endPoint: minioConfig.endpoint,
    port: minioConfig.port,
    useSSL: minioConfig.useSSL,
    accessKey: minioConfig.accessKey,
    secretKey: minioConfig.secretKey,
  });
  const stream = await client.getObject(minioConfig.bucket, storagePath);
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// ── OCR ───────────────────────────────────────────────────────────────────────
async function runOcr({ buffer, mimeType, sourceType, geminiApiKey, geminiModel }) {
  const bufferLen = buffer.length;

  if (mimeType === 'application/pdf') {
    try {
      const parsed = await pdfParse(buffer);
      const pdfText = parsed.text?.trim() ?? '';
      if (pdfText.length >= 50) return pdfText;
    } catch (_) { /* fall through */ }
  }

  const prompt = sourceType === 'pdf'
    ? 'สกัดข้อความทั้งหมดจากเอกสาร PDF นี้ให้ครบถ้วน รักษาโครงสร้างและหัวข้อให้ชัดเจน'
    : 'อธิบายและสกัดข้อความทั้งหมดในภาพนี้ ให้ครอบคลุมทุกข้อมูลที่มองเห็น';
  const system = 'คุณคือผู้ช่วย OCR/extraction ที่แม่นยำ ให้ข้อความที่สกัดได้เท่านั้น ไม่ต้องอธิบายเพิ่มเติม';

  if (bufferLen > INLINE_SIZE_LIMIT) {
    const fileUri = await uploadToGeminiFileApi(buffer, mimeType, geminiApiKey);
    return geminiGenerate({
      parts: [{ fileData: { mimeType, fileUri } }, { text: prompt }],
      system, apiKey: geminiApiKey, model: geminiModel,
    });
  }

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

// ── Chunking (mirrors ChunkingService.splitText) ─────────────────────────────
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
    } catch (err) {
      for (let j = 0; j < batch.length; j++) results.push([]);
    }
  }
  return results;
}

// ── Qdrant (plain HTTP, no client library) ────────────────────────────────────
async function qdrantDeleteByItemId(qdrantUrl, itemId) {
  try {
    await axios.post(
      `${qdrantUrl}/collections/${COLLECTION}/points/delete`,
      { filter: { must: [{ key: 'itemId', match: { value: itemId } }] } },
      { timeout: 30000, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (_) { /* non-fatal */ }
}

async function qdrantUpsert(qdrantUrl, points) {
  if (points.length === 0) return;
  await axios.put(
    `${qdrantUrl}/collections/${COLLECTION}/points`,
    { points },
    {
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
      maxContentLength: 100 * 1024 * 1024,
      maxBodyLength: 100 * 1024 * 1024,
    },
  );
}
