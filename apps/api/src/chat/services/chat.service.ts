import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PolicyRagService } from '../../rag/services/policy-rag.service';
import { HorizonRagService } from '../../rag/services/horizon-rag.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';
import { QueryRewriterService, ChatTurn } from '../../rag/services/query-rewriter.service';
import { RerankerService, RerankCandidate } from '../../rag/services/reranker.service';
import { QueryCacheService, CacheScope } from '../../rag/services/query-cache.service';
import { PageContextService, PageContext } from './page-context.service';

export interface ChatSource {
  type: 'policy' | 'horizon';
  title: string;
  summary: string;
  score: number;
  rerankScore?: number;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  queryId: string;
  pageContext?: { pageName: string };
  rewrittenQuery?: string;
  cached?: boolean;
}

// Retrieval pool sizes — fetch more candidates, rerank down to top-K
const POLICY_POOL_SIZE = 8;
const HORIZON_POOL_SIZE = 6;
const FINAL_TOP_K = 6;

// Item shape used for reranking — carries enough to rebuild ChatSource after
interface SourceCandidate extends RerankCandidate {
  type: 'policy' | 'horizon';
  score: number;
  title: string;
  summary: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly gemini: GeminiApiService,
    private readonly policyRag: PolicyRagService,
    private readonly horizonRag: HorizonRagService,
    private readonly pageCtxService: PageContextService,
    private readonly rewriter: QueryRewriterService,
    private readonly reranker: RerankerService,
    private readonly cache: QueryCacheService,
  ) {}

  async chat(
    query: string,
    pageContext?: PageContext,
    userId?: number,
    history: ChatTurn[] = [],
  ): Promise<ChatResponse> {
    const queryId = `chat-${Date.now()}`;

    // ── Step 0: Cache lookup ──────────────────────────────────────
    // Skip cache when we have conversation history — follow-up queries
    // depend on prior turns and wouldn't be safe to share across calls.
    const scope: CacheScope = {
      userId: userId ?? null,
      pageRoute: pageContext?.route ?? null,
      pageEntityId: pageContext?.entityId ?? null,
    };
    const shouldUseCache = history.length === 0;

    if (shouldUseCache) {
      const hit = await this.cache.lookup(query, scope);
      if (hit) {
        this.logger.debug(`Cache HIT: "${query.slice(0, 60)}"`);
        return {
          answer: hit.answer,
          sources: hit.sources,
          queryId,
          cached: true,
          ...(hit.pageContextName ? { pageContext: { pageName: hit.pageContextName } } : {}),
          ...(hit.rewrittenQuery ? { rewrittenQuery: hit.rewrittenQuery } : {}),
        };
      }
    }

    // ── Step 1: Rewrite query (uses history if provided) ───────────
    const rewrite = await this.rewriter.rewrite(query, history);
    const searchQuery = rewrite.rewritten;
    if (!rewrite.skipped && rewrite.rewritten !== rewrite.original) {
      this.logger.debug(`Query rewritten: "${rewrite.original}" → "${rewrite.rewritten}"`);
    }

    // ── Step 2: Retrieve larger candidate pool + page context in parallel
    const [policyResults, horizonResults, resolvedCtx] = await Promise.all([
      this.policyRag.search(searchQuery, POLICY_POOL_SIZE),
      this.horizonRag.search(searchQuery, HORIZON_POOL_SIZE),
      pageContext ? this.pageCtxService.resolve(pageContext, userId) : Promise.resolve(null),
    ]);

    // ── Step 3: Build unified candidate list for reranking ─────────
    const candidates: SourceCandidate[] = [
      ...policyResults.map((p, i) => ({
        id: `policy-${i}`,
        type: 'policy' as const,
        title: p.title || 'ระเบียบ',
        summary: p.summary || '',
        score: p.semanticScore ?? 0,
        text: `${p.title || 'ระเบียบ'}: ${p.summary || ''}`,
      })),
      ...horizonResults.map((h, i) => ({
        id: `horizon-${i}`,
        type: 'horizon' as const,
        title: h.title || 'แนวโน้ม',
        summary: h.summary || '',
        score: h.semanticScore ?? 0,
        text: `${h.title || 'แนวโน้ม'}: ${h.summary || ''}`,
      })),
    ].filter((c) => c.summary.length > 0 || c.title.length > 3);

    // ── Step 4: LLM rerank → top FINAL_TOP_K ───────────────────────
    // Reranker uses ORIGINAL query (what the user actually asked) for scoring,
    // while retrieval used the rewritten version for recall.
    const reranked = await this.reranker.rerank(query, candidates, FINAL_TOP_K, { minScore: 3 });

    const sources: ChatSource[] = reranked.map((r) => ({
      type: r.candidate.type,
      title: r.candidate.title,
      summary: r.candidate.summary,
      score: r.candidate.score,
      rerankScore: r.rerankScore,
    }));

    // ── Step 5: Build RAG context from reranked sources ────────────
    const ragContext = sources
      .map((s) =>
        s.type === 'policy'
          ? `[ระเบียบ/นโยบาย] ${s.title}:\n${s.summary}`
          : `[แนวโน้ม/แนวปฏิบัติ] ${s.title}:\n${s.summary}`,
      )
      .join('\n\n');

    const answer = await this.callGemini(query, ragContext, resolvedCtx);

    // ── Save to cache (skip if we had history) ─────────────────────
    if (shouldUseCache) {
      void this.cache.save(query, scope, {
        answer,
        sources,
        rewrittenQuery: rewrite.rewritten !== rewrite.original ? rewrite.rewritten : undefined,
        pageContextName: resolvedCtx?.pageName,
      });
    }

    return {
      answer,
      sources,
      queryId,
      cached: false,
      ...(resolvedCtx ? { pageContext: { pageName: resolvedCtx.pageName } } : {}),
      ...(rewrite.skipped || rewrite.rewritten === rewrite.original ? {} : { rewrittenQuery: rewrite.rewritten }),
    };
  }

  private async callGemini(
    query: string,
    ragContext: string,
    pageCtx?: { pageName: string; summary: string; details: string } | null,
  ): Promise<string> {
    if (!this.gemini.getApiKey()) {
      return 'ขออภัย ระบบ AI ยังไม่ได้รับการกำหนดค่า GEMINI_API_KEY';
    }

    // Build page-aware system prompt
    let pageSection = '';
    if (pageCtx) {
      pageSection =
        `\n\n== บริบทหน้าปัจจุบัน ==\n` +
        `ผู้ใช้กำลังอยู่ที่หน้า: ${pageCtx.pageName}\n` +
        `${pageCtx.summary}\n` +
        (pageCtx.details ? `\nข้อมูลในหน้า:\n${pageCtx.details}\n` : '');
    }

    const systemPrompt =
      `คุณเป็นผู้ช่วย AI ประจำระบบ NextOffice (ระบบงานสารบรรณอิเล็กทรอนิกส์) สำหรับสถาบันการศึกษา ` +
      `คุณมีความเชี่ยวชาญทั้งด้านระเบียบงานสารบรรณไทยและการใช้งานระบบ NextOffice ` +
      `ตอบคำถามด้วยภาษาไทยที่ชัดเจน ถูกต้อง และเป็นประโยชน์\n\n` +
      `ความสามารถของคุณ:\n` +
      `1. ตอบคำถามเกี่ยวกับระเบียบงานสารบรรณ พ.ศ. 2526 และที่แก้ไขเพิ่มเติม\n` +
      `2. อธิบายหนังสือราชการ 6 ประเภท, การรับ-ส่ง-เก็บรักษาหนังสือ\n` +
      `3. ช่วยเหลือเรื่องข้อมูลในหน้าปัจจุบันที่ผู้ใช้กำลังดูอยู่ — ตอบคำถามเกี่ยวกับเอกสาร เคส หรือข้อมูลที่แสดงบนหน้าจอ\n` +
      `4. แนะนำขั้นตอนการทำงานในระบบ NextOffice\n\n` +
      `หลักการตอบ:\n` +
      `- ถ้าผู้ใช้ถามเกี่ยวกับข้อมูลในหน้าปัจจุบัน ให้อ้างอิงจากบริบทหน้าเว็บที่ให้มา\n` +
      `- ถ้าถามเรื่องระเบียบหรือแนวปฏิบัติ ให้อ้างอิงจากฐานข้อมูล RAG\n` +
      `- ถ้าเกี่ยวข้องทั้งสองอย่าง ให้ผสมผสานข้อมูลจากทั้งสองแหล่ง\n` +
      `- ตอบกระชับ ตรงประเด็น ใช้ภาษาราชการอย่างเหมาะสม` +
      pageSection +
      (ragContext ? `\n\n== ข้อมูลอ้างอิงจากฐานความรู้ RAG ==\n${ragContext}` : '');

    try {
      const text = await this.gemini.generateText({
        system: systemPrompt,
        user: query,
        maxOutputTokens: 1500,
        temperature: 0.4,
      });
      return text || 'ขออภัย ไม่สามารถประมวลผลคำตอบได้';
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const body = err.response?.data as { error?: { message?: string; status?: string } } | undefined;
        const apiMsg = body?.error?.message ?? '';
        this.gemini.logAxiosError('Gemini (chat)', err);
        if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(apiMsg)) {
          return 'ขออภัย GEMINI_API_KEY ไม่ถูกต้อง กรุณาตรวจสอบใน apps/api/.env';
        }
        if (status === 403 || /PERMISSION_DENIED/i.test(apiMsg)) {
          return 'ขออภัย บัญชี Google AI ปฏิเสธการเรียกใช้ กรุณาตรวจสอบสิทธิ์ API ใน Google AI Studio';
        }
        if (status === 429 || /RESOURCE_EXHAUSTED|quota|Quota exceeded/i.test(apiMsg)) {
          return 'ขออภัย เกินโควต้า Gemini API กรุณารอแล้วลองใหม่หรือตรวจสอบแพ็กเกจใน Google AI Studio';
        }
        if (status === 400 && /model|not found|is not found/i.test(apiMsg)) {
          return 'ขออภัย ชื่อโมเดลไม่ถูกต้อง กรุณาตรวจสอบ GEMINI_MODEL ใน apps/api/.env';
        }
        if (!err.response && (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED')) {
          return 'ขออภัย เครือข่ายไม่สามารถเชื่อมต่อ Google Generative Language API ได้';
        }
      } else if (err instanceof Error) {
        this.logger.error(`Gemini call failed: ${err.message}`);
      } else {
        this.logger.error('Gemini call failed: unknown error');
      }
      return 'ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อ AI กรุณาลองใหม่อีกครั้ง';
    }
  }
}
