import { Injectable, Logger } from '@nestjs/common';
import { GeminiApiService } from '../../gemini/gemini-api.service';

export interface RerankCandidate {
  id: string;            // stable identifier (callers use their own scheme)
  text: string;          // the snippet the LLM will judge
  title?: string;        // optional — prepended to text for context
}

export interface RerankedItem<T extends RerankCandidate> {
  candidate: T;
  rerankScore: number;   // 0–10
}

export interface RerankOptions {
  minScore?: number;     // drop items below this (default 3)
  snippetChars?: number; // truncate snippets for cost (default 400)
  timeoutMs?: number;    // soft timeout — falls back if LLM stalls
}

/**
 * LLM-based reranker for RAG retrieval.
 *
 * Takes candidates from hybrid search / RRF / MMR, sends snippets to a
 * cheap+fast LLM (Gemini Flash) to score relevance 0–10, then returns
 * the top-K by rerank score. Typical precision gain: 15–30%.
 *
 * Source-agnostic — works with `HybridResult`, `ChatSource`, or any
 * structure adapted via `RerankCandidate`.
 */
@Injectable()
export class RerankerService {
  private readonly logger = new Logger(RerankerService.name);

  private readonly DEFAULT_MIN_SCORE = 3;
  private readonly DEFAULT_SNIPPET_CHARS = 400;
  private readonly MAX_CANDIDATES = 20;   // hard cap to keep prompt under budget

  constructor(private readonly gemini: GeminiApiService) {}

  async rerank<T extends RerankCandidate>(
    query: string,
    candidates: T[],
    topK: number,
    options: RerankOptions = {},
  ): Promise<RerankedItem<T>[]> {
    if (candidates.length === 0) return [];

    const minScore = options.minScore ?? this.DEFAULT_MIN_SCORE;
    const snippetChars = options.snippetChars ?? this.DEFAULT_SNIPPET_CHARS;

    // If we already have ≤ topK, skip the LLM call — nothing to rerank down to.
    if (candidates.length <= topK) {
      return candidates.map((c) => ({ candidate: c, rerankScore: 5 }));
    }

    if (!this.gemini.getApiKey()) {
      this.logger.debug('No Gemini key, skipping rerank — returning first topK');
      return candidates.slice(0, topK).map((c) => ({ candidate: c, rerankScore: 5 }));
    }

    // Cap candidates to avoid oversized prompts
    const pool = candidates.slice(0, this.MAX_CANDIDATES);

    const systemPrompt =
      `คุณเป็นผู้เชี่ยวชาญด้านการค้นหาเอกสารราชการไทย\n` +
      `หน้าที่: ให้คะแนนความเกี่ยวข้องของเอกสารแต่ละชิ้นกับคำถาม (0-10)\n\n` +
      `เกณฑ์การให้คะแนน:\n` +
      `- 9-10: ตอบคำถามได้ตรงประเด็นอย่างชัดเจน\n` +
      `- 7-8:  มีข้อมูลที่ใช้ตอบได้บางส่วน\n` +
      `- 4-6:  เกี่ยวข้องกับหัวข้อแต่ไม่ตอบตรง ๆ\n` +
      `- 1-3:  เกี่ยวข้องเล็กน้อย\n` +
      `- 0:    ไม่เกี่ยวข้อง\n\n` +
      `ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น:\n` +
      `{"rankings":[{"id":0,"score":8},{"id":1,"score":3}, ...]}\n` +
      `ให้คะแนนทุกชิ้นที่ส่งมา ตามลำดับ id 0 ถึง ${pool.length - 1}`;

    const snippets = pool
      .map((c, i) => {
        const head = c.title ? `(${c.title}) ` : '';
        const body = c.text.slice(0, snippetChars);
        const ellipsis = c.text.length > snippetChars ? '...' : '';
        return `[${i}] ${head}${body}${ellipsis}`;
      })
      .join('\n\n');

    const userPrompt = `คำถาม: ${query}\n\nเอกสาร:\n${snippets}`;

    try {
      const text = await this.withTimeout(
        this.gemini.generateText({
          system: systemPrompt,
          user: userPrompt,
          maxOutputTokens: 1000,
          temperature: 0.1,
        }),
        options.timeoutMs ?? 20_000,
      );

      const scores = this.parseScores(text, pool.length);
      if (!scores) {
        this.logger.warn('Rerank parse failed, falling back to input order');
        return pool.slice(0, topK).map((c) => ({ candidate: c, rerankScore: 5 }));
      }

      const ranked: RerankedItem<T>[] = pool.map((c, i) => ({
        candidate: c,
        rerankScore: scores[i] ?? 0,
      }));

      return ranked
        .filter((r) => r.rerankScore >= minScore)
        .sort((a, b) => b.rerankScore - a.rerankScore)
        .slice(0, topK);
    } catch (err: any) {
      this.logger.warn(`Rerank failed (${err?.message ?? err}), falling back to input order`);
      return pool.slice(0, topK).map((c) => ({ candidate: c, rerankScore: 5 }));
    }
  }

  private parseScores(text: string, expectedLen: number): number[] | null {
    const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as { rankings?: Array<{ id: number; score: number }> };
      if (!parsed.rankings || !Array.isArray(parsed.rankings)) return null;

      const scores: number[] = new Array(expectedLen).fill(0);
      for (const r of parsed.rankings) {
        if (typeof r.id === 'number' && r.id >= 0 && r.id < expectedLen && typeof r.score === 'number') {
          scores[r.id] = Math.max(0, Math.min(10, r.score));
        }
      }
      return scores;
    } catch {
      return null;
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }
}
