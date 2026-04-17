import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService, COLLECTION_KNOWLEDGE, COLLECTION_DOCUMENTS } from './vector-store.service';
import { ThaiTokenizerService } from './thai-tokenizer.service';

export interface HybridResult {
  sourceType: 'policy' | 'horizon' | 'document' | 'user_knowledge';
  sourceId: bigint;
  vectorScore: number;   // 0-1 cosine similarity (raw)
  keywordScore: number;  // 0-1 TF-IDF relevance (raw)
  hybridScore: number;   // 0-1 normalized RRF score (kept for downstream blend)
  rrfScore?: number;     // raw RRF contribution (small, unnormalized)
  vectorRank?: number;   // 1-based rank in vector list, undefined if not in top pool
  keywordRank?: number;  // 1-based rank in keyword list, undefined if not in top pool
  snippet: string;
  payload: Record<string, any>;
}

@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);

  // ── RRF constants ──────────────────────────────────────────────────
  private readonly RRF_K = 60;                 // Cormack et al. 2009 default
  private readonly RRF_VECTOR_WEIGHT = 1.0;
  private readonly RRF_KEYWORD_WEIGHT = 1.0;
  private readonly MAX_RANK_PER_SOURCE = 30;   // only top-30 of each source contributes

  // ── MMR constants ──────────────────────────────────────────────────
  private readonly MMR_LAMBDA = 0.7;           // 0.7 = relevance-first with diversity
  private readonly MMR_CANDIDATE_MULTIPLIER = 3;

  // ── Filter threshold ───────────────────────────────────────────────
  private readonly MIN_HYBRID_SCORE = 0.05;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    private readonly tokenizer: ThaiTokenizerService,
  ) {}

  async search(query: string, topK = 10, orgId?: bigint): Promise<HybridResult[]> {
    let queryVector: number[] = [];
    try {
      queryVector = await this.embedding.embed(query);
    } catch (err) {
      this.logger.warn(`Vector embedding failed, falling back to keyword-only: ${err.message}`);
    }

    const [knowledgeVec, documentsVec] = queryVector.length
      ? await Promise.all([
          this.vectorStore.search(COLLECTION_KNOWLEDGE, queryVector, 20),
          this.vectorStore.search(COLLECTION_DOCUMENTS, queryVector, 20),
        ])
      : [[], []];

    // vector score lookup by payload key
    const vectorScoreMap = new Map<string, number>();
    for (const r of knowledgeVec) {
      const key = `${r.payload.sourceType}:${r.payload.sourceId}`;
      vectorScoreMap.set(key, r.score);
    }

    // ── Policy candidates (vector + keyword) ─────────────────────────
    const policyItems = await this.prisma.policyItem.findMany({
      where: { effectiveStatus: 'active' },
      include: { document: { select: { title: true, summaryText: true } }, clauses: { select: { clauseText: true } } },
      take: 100,
    });

    const policyCandidates: HybridResult[] = policyItems.map((item) => {
      const text = [
        item.document?.title ?? '',
        item.summaryForAction ?? '',
        item.clauses.map((c) => c.clauseText).join(' '),
      ].join(' ');
      return {
        sourceType: 'policy' as const,
        sourceId: item.id,
        vectorScore: vectorScoreMap.get(`policy_clause:${item.id}`) ?? 0,
        keywordScore: this.tokenizer.computeRelevance(query, text),
        hybridScore: 0,
        snippet: (item.summaryForAction ?? item.document?.title ?? '').substring(0, 200),
        payload: { mandatoryLevel: item.mandatoryLevel, complianceRiskLevel: item.complianceRiskLevel },
      };
    });

    // ── Horizon candidates ──────────────────────────────────────────
    const horizonItems = await this.prisma.horizonItem.findMany({
      include: {
        document: { select: { title: true, summaryText: true } },
        practices: { select: { practiceTitle: true } },
      },
      take: 100,
    });

    const horizonCandidates: HybridResult[] = horizonItems.map((item) => {
      const text = [
        (item as any).document?.title ?? '',
        item.summary ?? '',
        (item as any).practices?.map((p: any) => p.practiceTitle).join(' ') ?? '',
      ].join(' ');
      return {
        sourceType: 'horizon' as const,
        sourceId: item.id,
        vectorScore: vectorScoreMap.get(`horizon_practice:${item.id}`) ?? 0,
        keywordScore: this.tokenizer.computeRelevance(query, text),
        hybridScore: 0,
        snippet: (item.summary ?? (item as any).document?.title ?? '').substring(0, 200),
        payload: { scope: item.scope, sector: item.sector },
      };
    });

    // ── Document chunk candidates (vector-heavy, keyword on snippet) ─
    const chunkCandidates: HybridResult[] = documentsVec
      .filter((r) => r.score > 0.3)
      .map((r) => {
        const text = r.payload.text ?? '';
        return {
          sourceType: 'document' as const,
          sourceId: BigInt(r.payload.documentId ?? 0),
          vectorScore: r.score,
          keywordScore: this.tokenizer.computeRelevance(query, text),
          hybridScore: 0,
          snippet: text.substring(0, 200),
          payload: r.payload,
        };
      });

    // ── User knowledge candidates (org-scoped) ──────────────────────
    const userKnowledgeVec = knowledgeVec.filter(
      (r) => r.payload.sourceType === 'user_knowledge' &&
        (!orgId || r.payload.organizationId === orgId.toString()),
    );
    const userKnowledgeCandidates: HybridResult[] = userKnowledgeVec
      .filter((r) => r.score > 0.3)
      .map((r) => ({
        sourceType: 'user_knowledge' as const,
        sourceId: BigInt(r.payload.itemId ?? 0),
        vectorScore: r.score,
        keywordScore: this.tokenizer.computeRelevance(query, r.payload.text ?? ''),
        hybridScore: 0,
        snippet: (r.payload.text ?? '').substring(0, 200),
        payload: r.payload,
      }));

    const allCandidates = [
      ...policyCandidates,
      ...horizonCandidates,
      ...chunkCandidates,
      ...userKnowledgeCandidates,
    ];

    if (allCandidates.length === 0) return [];

    // ── Stage 1: RRF fusion ─────────────────────────────────────────
    const fused = this.reciprocalRankFusion(allCandidates);

    // ── Stage 2: noise filter ───────────────────────────────────────
    const filtered = fused.filter((r) => r.hybridScore >= this.MIN_HYBRID_SCORE);

    // ── Stage 3: MMR diversification ────────────────────────────────
    const poolSize = Math.min(filtered.length, topK * this.MMR_CANDIDATE_MULTIPLIER);
    const pool = filtered.slice(0, poolSize);
    const diversified = this.mmrDiversify(pool, topK, this.MMR_LAMBDA);

    this.logger.debug(
      `RRF+MMR: ${allCandidates.length} cand → ${filtered.length} filtered → ${diversified.length} final`,
    );

    return diversified;
  }

  // ══════════════════════════════════════════════════════════════════
  //   Reciprocal Rank Fusion (Cormack et al. 2009)
  //
  //     rrf(d) = Σ_s  w_s / (k + rank_s(d))
  //
  //   - items absent from a source contribute 0 from that source
  //   - items beyond MAX_RANK_PER_SOURCE are treated as absent
  //   - raw rrf is tiny (≤ ~0.033), so normalize by max to preserve
  //     downstream `hybridScore * 0.65 + ...` blend in retrieval.service
  // ══════════════════════════════════════════════════════════════════
  private reciprocalRankFusion(candidates: HybridResult[]): HybridResult[] {
    const vectorRanked = [...candidates]
      .filter((c) => c.vectorScore > 0)
      .sort((a, b) => b.vectorScore - a.vectorScore)
      .slice(0, this.MAX_RANK_PER_SOURCE);

    const keywordRanked = [...candidates]
      .filter((c) => c.keywordScore > 0)
      .sort((a, b) => b.keywordScore - a.keywordScore)
      .slice(0, this.MAX_RANK_PER_SOURCE);

    const vectorRankMap = new Map<string, number>();
    vectorRanked.forEach((c, i) => vectorRankMap.set(this.candidateKey(c), i + 1));

    const keywordRankMap = new Map<string, number>();
    keywordRanked.forEach((c, i) => keywordRankMap.set(this.candidateKey(c), i + 1));

    let maxRrf = 0;
    const scored = candidates.map((c) => {
      const key = this.candidateKey(c);
      const vr = vectorRankMap.get(key);
      const kr = keywordRankMap.get(key);
      let rrf = 0;
      if (vr !== undefined) rrf += this.RRF_VECTOR_WEIGHT / (this.RRF_K + vr);
      if (kr !== undefined) rrf += this.RRF_KEYWORD_WEIGHT / (this.RRF_K + kr);
      if (rrf > maxRrf) maxRrf = rrf;
      return { ...c, rrfScore: rrf, vectorRank: vr, keywordRank: kr };
    });

    return scored
      .map((c) => ({
        ...c,
        hybridScore: maxRrf > 0 ? c.rrfScore / maxRrf : 0,
      }))
      .sort((a, b) => b.hybridScore - a.hybridScore);
  }

  // ══════════════════════════════════════════════════════════════════
  //   Maximal Marginal Relevance
  //
  //     MMR(d) = λ · rel(d) − (1−λ) · max_{s ∈ selected} sim(d, s)
  //
  //   Keeps top-K from being dominated by adjacent chunks of one doc.
  // ══════════════════════════════════════════════════════════════════
  private mmrDiversify(candidates: HybridResult[], topK: number, lambda: number): HybridResult[] {
    if (candidates.length <= topK) return candidates;

    const selected: HybridResult[] = [];
    const remaining = [...candidates];

    selected.push(remaining.shift()!); // top-relevance first

    while (selected.length < topK && remaining.length > 0) {
      let bestIdx = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        let maxSim = 0;
        for (const sel of selected) {
          const sim = this.similarity(cand, sel);
          if (sim > maxSim) maxSim = sim;
        }
        const mmrScore = lambda * cand.hybridScore - (1 - lambda) * maxSim;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      selected.push(remaining.splice(bestIdx, 1)[0]);
    }

    return selected;
  }

  // Heuristic similarity between two results (no stored embedding).
  //   exact same item              → 1.0
  //   same document, adjacent chunk → +0.85
  //   same document, any chunk     → +0.60
  //   same source type             → +0.10
  //   snippet jaccard              → +0..0.30
  private similarity(a: HybridResult, b: HybridResult): number {
    if (a.sourceType === b.sourceType && a.sourceId === b.sourceId &&
        (a.payload?.chunkIndex ?? -1) === (b.payload?.chunkIndex ?? -1)) {
      return 1;
    }

    let sim = 0;

    const aDocId = a.payload?.documentId ?? (a.sourceType === 'document' ? a.sourceId.toString() : null);
    const bDocId = b.payload?.documentId ?? (b.sourceType === 'document' ? b.sourceId.toString() : null);
    if (aDocId && bDocId && aDocId.toString() === bDocId.toString()) {
      sim += 0.6;
      const aIdx = a.payload?.chunkIndex;
      const bIdx = b.payload?.chunkIndex;
      if (typeof aIdx === 'number' && typeof bIdx === 'number' && Math.abs(aIdx - bIdx) <= 1) {
        sim += 0.25;
      }
    }

    if (a.sourceType === b.sourceType) sim += 0.1;

    sim += Math.min(this.jaccard(a.snippet, b.snippet), 0.3);

    return Math.min(sim, 1);
  }

  private jaccard(a: string, b: string): number {
    const tokensA = new Set((a || '').toLowerCase().split(/\s+/).filter((t) => t.length > 2));
    const tokensB = new Set((b || '').toLowerCase().split(/\s+/).filter((t) => t.length > 2));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;
    let intersect = 0;
    for (const t of tokensA) if (tokensB.has(t)) intersect++;
    const union = tokensA.size + tokensB.size - intersect;
    return union > 0 ? intersect / union : 0;
  }

  // Unique key for RRF rank deduplication.
  // Document chunks from the same doc but different chunkIndex must stay distinct.
  private candidateKey(r: HybridResult): string {
    if (r.sourceType === 'document') {
      const chunkIdx = r.payload?.chunkIndex ?? 0;
      return `document:${r.sourceId}_${chunkIdx}`;
    }
    if (r.sourceType === 'user_knowledge') {
      const itemId = r.payload?.itemId ?? r.sourceId.toString();
      return `user_knowledge:${itemId}`;
    }
    return `${r.sourceType}:${r.sourceId}`;
  }
}
