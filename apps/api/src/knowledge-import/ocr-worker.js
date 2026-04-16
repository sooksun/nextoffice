/**
 * OCR Worker — runs in a separate child_process.fork() with its own V8 heap.
 *
 * Why a separate process?
 *   NestJS main process has ~88 MB of permanent live objects (DI container, modules).
 *   Running OCR in the same process leaves only ~25 MB of headroom, which is not
 *   enough for pdf-parse (pdf.js creates 15-25 MB of intermediate JS objects) or
 *   for Gemini API response buffering. This causes "ineffective mark-compacts" OOM.
 *
 *   A child process starts fresh with ~20 MB baseline, giving >4 GB of headroom
 *   for OCR. When the child exits, all its memory is released by the OS.
 *
 * Protocol:
 *   Parent sends: { storagePath, mimeType, sourceType, minioConfig, geminiApiKey, geminiModel }
 *   Child replies: { ok: true, text: string }  OR  { ok: false, error: string }
 *   Child exits automatically after sending the reply.
 *
 * Note: plain .js (not .ts) so it can be fork()'d directly in both dev and prod
 * without ts-node or build step (fork uses the compiled dist/ in prod via __filename
 * substitution, or the src/ path with require('ts-node/register') in dev).
 */

'use strict';

// In production: this file is compiled to dist/src/knowledge-import/ocr-worker.js
// In development: loaded via ts-node so TypeScript imports work.
// Both paths load the same npm packages from node_modules.

const Minio = require('minio');
const axios = require('axios');
const FormData = require('form-data');

// pdf-parse uses CommonJS module.exports = fn
const pdfParse = require('pdf-parse');

const INLINE_SIZE_LIMIT = 2 * 1024 * 1024; // 2 MB

process.on('message', async (msg) => {
  const { storagePath, mimeType, sourceType, minioConfig, geminiApiKey, geminiModel } = msg;

  try {
    const text = await runOcr({ storagePath, mimeType, sourceType, minioConfig, geminiApiKey, geminiModel });
    process.send({ ok: true, text });
  } catch (err) {
    process.send({ ok: false, error: err?.message ?? String(err) });
  } finally {
    // Always exit so the parent's fork() cleanup runs and OS reclaims memory
    process.exit(0);
  }
});

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

async function uploadToGeminiFileApi(buffer, mimeType, apiKey) {
  const form = new FormData();
  form.append('file', buffer, { filename: 'document', contentType: mimeType });
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    form,
    {
      headers: form.getHeaders(),
      timeout: 60000,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
    },
  );
  const fileUri = res.data?.file?.uri;
  if (!fileUri) throw new Error('Gemini File API did not return a fileUri');
  return fileUri;
}

async function geminiGenerateFromParts({ parts, system, apiKey, model }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const res = await axios.post(endpoint, body, { timeout: 120000, headers: { 'Content-Type': 'application/json' } });
  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function runOcr({ storagePath, mimeType, sourceType, minioConfig, geminiApiKey, geminiModel }) {
  const buffer = await getBuffer(minioConfig, storagePath);
  const bufferLen = buffer.length;

  // 1. Text-based PDF → pdf-parse (no network, no heap spike in NestJS)
  if (mimeType === 'application/pdf') {
    try {
      const parsed = await pdfParse(buffer);
      const pdfText = parsed.text?.trim() ?? '';
      if (pdfText.length >= 50) {
        return pdfText;
      }
    } catch (_) {
      // fall through to Gemini
    }
  }

  // 2. Scanned PDF / Image → Gemini
  const prompt = sourceType === 'pdf'
    ? 'สกัดข้อความทั้งหมดจากเอกสาร PDF นี้ให้ครบถ้วน รักษาโครงสร้างและหัวข้อให้ชัดเจน'
    : 'อธิบายและสกัดข้อความทั้งหมดในภาพนี้ ให้ครอบคลุมทุกข้อมูลที่มองเห็น';
  const system = 'คุณคือผู้ช่วย OCR/extraction ที่แม่นยำ ให้ข้อความที่สกัดได้เท่านั้น ไม่ต้องอธิบายเพิ่มเติม';

  if (bufferLen > INLINE_SIZE_LIMIT) {
    const fileUri = await uploadToGeminiFileApi(buffer, mimeType, geminiApiKey);
    return geminiGenerateFromParts({
      parts: [{ fileData: { mimeType, fileUri } }, { text: prompt }],
      system,
      apiKey: geminiApiKey,
      model: geminiModel,
    });
  }

  const base64 = buffer.toString('base64');
  return geminiGenerateFromParts({
    parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }],
    system,
    apiKey: geminiApiKey,
    model: geminiModel,
  });
}
