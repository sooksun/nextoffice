import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIM = 768; // gemini-embedding-001 natively outputs 3072, we truncate via outputDimensionality

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private readonly config: ConfigService) {}

  get dimension(): number {
    return EMBEDDING_DIM;
  }

  get modelName(): string {
    return EMBEDDING_MODEL;
  }

  async embed(text: string): Promise<number[]> {
    const key = this.config.get<string>('GEMINI_API_KEY')?.trim();
    if (!key) throw new Error('GEMINI_API_KEY not configured');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(key)}`;

    const response = await axios.post(
      url,
      { model: `models/${EMBEDDING_MODEL}`, content: { parts: [{ text }] }, outputDimensionality: EMBEDDING_DIM },
      { timeout: 30000, headers: { 'Content-Type': 'application/json' } },
    );

    return response.data?.embedding?.values ?? [];
  }

  /** Batch embed — sequential (kept for back-compat; prefer embedBatchParallel) */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      try {
        results.push(await this.embed(text));
      } catch (err) {
        this.logger.warn(`Embed failed for text snippet: ${err.message}`);
        results.push([]);
      }
    }
    return results;
  }

  /**
   * Batch embed — uses Gemini `batchEmbedContents` API (up to 100 texts per request).
   * เร็วกว่า embedBatch เดิมประมาณ 50-100 เท่า สำหรับเอกสารที่มี chunks เยอะ
   */
  async embedBatchParallel(texts: string[]): Promise<number[][]> {
    const key = this.config.get<string>('GEMINI_API_KEY')?.trim();
    if (!key) throw new Error('GEMINI_API_KEY not configured');
    if (texts.length === 0) return [];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${encodeURIComponent(key)}`;
    const BATCH_SIZE = 100; // Gemini limit: 100 requests per batchEmbedContents call

    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      try {
        const response = await axios.post(
          url,
          {
            requests: batch.map((text) => ({
              model: `models/${EMBEDDING_MODEL}`,
              content: { parts: [{ text }] },
              outputDimensionality: EMBEDDING_DIM,
            })),
          },
          { timeout: 60000, headers: { 'Content-Type': 'application/json' } },
        );
        const embeddings = response.data?.embeddings ?? [];
        for (const e of embeddings) {
          results.push(e.values ?? []);
        }
        // Pad with empty arrays if response is shorter than batch
        while (results.length < i + batch.length) results.push([]);
      } catch (err: any) {
        this.logger.warn(`Batch embed failed (batch ${i}–${i + batch.length}): ${err.message}`);
        // Fall back to empty vectors for this batch
        for (let j = 0; j < batch.length; j++) results.push([]);
      }
    }

    return results;
  }
}
