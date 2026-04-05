import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIM = 768;

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
      { model: `models/${EMBEDDING_MODEL}`, content: { parts: [{ text }] } },
      { timeout: 30000, headers: { 'Content-Type': 'application/json' } },
    );

    return response.data?.embedding?.values ?? [];
  }

  /** Batch embed — sequential to avoid rate limits */
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
}
