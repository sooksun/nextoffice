import { Injectable, OnModuleInit } from '@nestjs/common';
import * as wordcut from 'wordcut';

@Injectable()
export class ThaiTokenizerService implements OnModuleInit {
  private initialized = false;

  onModuleInit() {
    wordcut.init();
    this.initialized = true;
  }

  /**
   * ตัดคำภาษาไทย → array ของคำ (ลบ stop words + whitespace)
   */
  tokenize(text: string): string[] {
    if (!this.initialized) wordcut.init();
    const raw = wordcut.cut(text);
    return raw
      .split('|')
      .map((w: string) => w.trim().toLowerCase())
      .filter((w: string) => w.length > 1 && !STOP_WORDS.has(w));
  }

  /**
   * คำนวณ TF-IDF-like relevance ระหว่าง query กับ document
   * ใช้ term frequency + inverse document length normalization
   */
  computeRelevance(query: string, document: string): number {
    const queryTokens = this.tokenize(query);
    const docTokens = this.tokenize(document);

    if (queryTokens.length === 0 || docTokens.length === 0) return 0;

    // Build document term frequency map
    const docTf = new Map<string, number>();
    for (const t of docTokens) {
      docTf.set(t, (docTf.get(t) || 0) + 1);
    }

    let matchScore = 0;
    const matchedTerms = new Set<string>();

    for (const qt of queryTokens) {
      // Exact match
      if (docTf.has(qt)) {
        const tf = docTf.get(qt)!;
        // Log-scaled TF to avoid domination by frequent terms
        matchScore += 1 + Math.log(tf);
        matchedTerms.add(qt);
        continue;
      }
      // Partial/substring match (important for Thai compound words)
      for (const [docWord, count] of docTf) {
        if (docWord.includes(qt) || qt.includes(docWord)) {
          matchScore += 0.5 * (1 + Math.log(count));
          matchedTerms.add(qt);
          break;
        }
      }
    }

    // Coverage: what fraction of query terms were found
    const coverage = matchedTerms.size / queryTokens.length;

    // Normalize by document length (shorter docs that match get boosted)
    const lengthNorm = Math.min(1, 100 / docTokens.length);

    // Combined score: coverage is most important, boosted by match depth
    const score = coverage * 0.6 + (matchScore / queryTokens.length) * 0.3 + lengthNorm * 0.1;

    return Math.min(score, 1);
  }
}

/** Common Thai stop words */
const STOP_WORDS = new Set([
  'การ', 'ที่', 'ของ', 'ใน', 'และ', 'จะ', 'ได้', 'ให้', 'มี', 'หรือ',
  'เป็น', 'กับ', 'แต่', 'โดย', 'ไม่', 'ว่า', 'ก็', 'แล้ว', 'อยู่', 'จาก',
  'ไป', 'มา', 'ด้วย', 'ซึ่ง', 'อัน', 'เมื่อ', 'ถ้า', 'ยัง', 'คือ', 'นี้',
  'นั้น', 'อื่น', 'เพื่อ', 'ตาม', 'ต่อ', 'เช่น', 'the', 'a', 'an', 'is',
  'are', 'was', 'be', 'to', 'of', 'and', 'in', 'for', 'on', 'with',
]);
