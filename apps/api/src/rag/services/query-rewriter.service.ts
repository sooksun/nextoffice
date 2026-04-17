import { Injectable, Logger } from '@nestjs/common';
import { GeminiApiService } from '../../gemini/gemini-api.service';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface RewriteResult {
  original: string;
  rewritten: string;
  expansions: string[];  // synonym / related terms to add to search
  skipped: boolean;      // true = no LLM call was made
  reason?: string;
}

/**
 * Query rewriting for RAG retrieval.
 *
 * Expands short, ambiguous, or pronoun-heavy queries into full search terms
 * using conversation context. Example:
 *   user:     "ครูผู้ช่วยเลื่อนขั้นยังไง"  + history mentions ก.ค.ศ.
 *   rewrite:  "หลักเกณฑ์การเลื่อนเงินเดือนครูผู้ช่วย ตามระเบียบ ก.ค.ศ."
 *
 * Skips the LLM call when the query is already specific and no history is
 * provided — saves ~500–800ms per chat request.
 */
@Injectable()
export class QueryRewriterService {
  private readonly logger = new Logger(QueryRewriterService.name);

  // Skip rewriting for queries that already look specific enough
  private readonly MIN_QUERY_CHARS_FOR_SKIP = 25;
  // Pronouns / deictic words that signal the query needs history context
  private readonly PRONOUN_REGEX = /\b(มัน|นี่|นั่น|ตัวนี้|เรื่องนี้|เรื่องนั้น|ที่ว่า|ดังกล่าว|อันนั้น)\b|^(แล้ว|ต่อ|เพิ่มเติม)/;

  constructor(private readonly gemini: GeminiApiService) {}

  async rewrite(query: string, history: ChatTurn[] = []): Promise<RewriteResult> {
    const trimmed = query.trim();

    // ── Skip logic ──────────────────────────────────────────────
    const hasPronouns = this.PRONOUN_REGEX.test(trimmed);
    const isFollowUp = history.length > 0 && hasPronouns;
    const isLongSpecific = trimmed.length >= this.MIN_QUERY_CHARS_FOR_SKIP && !hasPronouns;

    if (isLongSpecific && history.length === 0) {
      return { original: trimmed, rewritten: trimmed, expansions: [], skipped: true, reason: 'query already specific' };
    }
    if (!this.gemini.getApiKey()) {
      return { original: trimmed, rewritten: trimmed, expansions: [], skipped: true, reason: 'no gemini key' };
    }

    // ── LLM rewrite ─────────────────────────────────────────────
    const systemPrompt =
      `คุณช่วยเขียนคำค้นหา (search query) สำหรับค้นเอกสารราชการไทยให้ค้นง่ายขึ้น\n\n` +
      `งานของคุณ:\n` +
      `1. ถ้ามีบริบทบทสนทนา ให้แทนที่คำสรรพนาม (มัน, นี่, เรื่องนั้น, ดังกล่าว) ด้วยคำนามจริง\n` +
      `2. เพิ่มคำสำคัญที่เกี่ยวข้องกับงานราชการ (เช่น ก.ค.ศ., สพฐ., ระเบียบ, หลักเกณฑ์) เฉพาะเมื่อเกี่ยวข้องจริง\n` +
      `3. เสนอ synonym / คำใกล้เคียง 2-4 คำ\n\n` +
      `ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น:\n` +
      `{"rewritten": "<query ที่ปรับแล้ว>", "expansions": ["<synonym 1>", "<synonym 2>"]}\n\n` +
      `ถ้าไม่ต้องปรับ ให้ตอบ {"rewritten": "<query เดิม>", "expansions": []}`;

    const historyStr = history
      .slice(-6) // last 3 turns (user + assistant)
      .map((m) => `${m.role === 'user' ? 'ผู้ใช้' : 'ผู้ช่วย'}: ${m.content.slice(0, 300)}`)
      .join('\n');

    const userPrompt = historyStr
      ? `บทสนทนาก่อนหน้า:\n${historyStr}\n\nคำถามล่าสุด: ${trimmed}`
      : `คำถาม: ${trimmed}`;

    try {
      const text = await this.gemini.generateText({
        system: systemPrompt,
        user: userPrompt,
        maxOutputTokens: 400,
        temperature: 0.2,
      });

      const parsed = this.parseJson(text);
      if (!parsed || typeof parsed.rewritten !== 'string' || parsed.rewritten.trim().length === 0) {
        return { original: trimmed, rewritten: trimmed, expansions: [], skipped: false, reason: 'parse failed' };
      }

      const rewritten = parsed.rewritten.trim();
      const expansions = Array.isArray(parsed.expansions)
        ? parsed.expansions.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0).slice(0, 4)
        : [];

      if (isFollowUp || rewritten !== trimmed || expansions.length > 0) {
        this.logger.debug(`Rewrite: "${trimmed}" → "${rewritten}" [+${expansions.length} expansions]`);
      }

      return { original: trimmed, rewritten, expansions, skipped: false };
    } catch (err: any) {
      this.logger.warn(`Rewrite failed, falling back to original: ${err?.message ?? err}`);
      return { original: trimmed, rewritten: trimmed, expansions: [], skipped: false, reason: 'llm error' };
    }
  }

  private parseJson(text: string): { rewritten?: string; expansions?: unknown[] } | null {
    // Strip markdown fences if present, then extract first JSON object
    const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
