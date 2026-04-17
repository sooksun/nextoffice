import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { ChatSource } from '../../chat/services/chat.service';

export interface CacheScope {
  userId?: bigint | number | null;      // hashed into key to prevent cross-user leaks
  organizationId?: bigint | number | null;
  pageRoute?: string | null;
  pageEntityId?: bigint | number | null;
}

export interface CachedEntry {
  answer: string;
  sources: ChatSource[];
  rewrittenQuery?: string;
  pageContextName?: string;
}

export interface CacheSaveInput extends CachedEntry {
  ttlMs?: number; // override default TTL
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  avgHitCount: number;
  topHits: Array<{ normalizedQuery: string; hitCount: number; lastHitAt: Date | null }>;
}

/**
 * LRU-ish cache for chat answers, keyed by normalized query + scope hash.
 *
 * Scope = (organizationId, pageRoute, pageEntityId). Same question asked on
 * /cases/42 vs /cases/43 gets different cache entries because page context
 * is part of the answer.
 */
@Injectable()
export class QueryCacheService {
  private readonly logger = new Logger(QueryCacheService.name);

  // TTL windows — page-scoped data changes faster than policy knowledge.
  private readonly TTL_PAGE_SCOPED_MS = 10 * 60 * 1000;    // 10 min
  private readonly TTL_KNOWLEDGE_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_QUERY_CHARS = 2000;

  constructor(private readonly prisma: PrismaService) {}

  async lookup(query: string, scope: CacheScope = {}): Promise<CachedEntry | null> {
    const normalized = this.normalize(query);
    if (!normalized) return null;

    const hash = this.computeHash(normalized, scope);
    const row = await this.prisma.queryCache.findUnique({ where: { queryHash: hash } });
    if (!row) return null;

    // Expired — lazy delete
    if (row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.queryCache.delete({ where: { id: row.id } }).catch(() => void 0);
      return null;
    }

    // Bump hit metrics (fire-and-forget)
    this.prisma.queryCache
      .update({
        where: { id: row.id },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      })
      .catch((err) => this.logger.warn(`Cache hit metric update failed: ${err.message}`));

    return {
      answer: row.answer,
      sources: (row.sources as unknown as ChatSource[]) ?? [],
      rewrittenQuery: row.rewrittenQuery ?? undefined,
      pageContextName: row.pageContextName ?? undefined,
    };
  }

  async save(query: string, scope: CacheScope, entry: CacheSaveInput): Promise<void> {
    const normalized = this.normalize(query);
    if (!normalized) return;

    // Guard: never cache empty or error-ish answers
    const trimmed = entry.answer.trim();
    if (trimmed.length < 10 || this.looksLikeError(trimmed)) return;

    const hash = this.computeHash(normalized, scope);
    const ttlMs = entry.ttlMs ?? (this.hasPageScope(scope) ? this.TTL_PAGE_SCOPED_MS : this.TTL_KNOWLEDGE_MS);
    const expiresAt = new Date(Date.now() + ttlMs);

    try {
      await this.prisma.queryCache.upsert({
        where: { queryHash: hash },
        create: {
          queryHash: hash,
          normalizedQuery: normalized.slice(0, this.MAX_QUERY_CHARS),
          answer: entry.answer,
          sources: (entry.sources ?? []) as any,
          rewrittenQuery: entry.rewrittenQuery?.slice(0, this.MAX_QUERY_CHARS) ?? null,
          pageContextName: entry.pageContextName?.slice(0, 255) ?? null,
          organizationId: this.toBigInt(scope.organizationId),
          pageRoute: scope.pageRoute?.slice(0, 255) ?? null,
          pageEntityId: this.toBigInt(scope.pageEntityId),
          expiresAt,
        },
        update: {
          answer: entry.answer,
          sources: (entry.sources ?? []) as any,
          rewrittenQuery: entry.rewrittenQuery?.slice(0, this.MAX_QUERY_CHARS) ?? null,
          pageContextName: entry.pageContextName?.slice(0, 255) ?? null,
          expiresAt,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Cache save failed: ${err?.message ?? err}`);
    }
  }

  /** Delete expired entries. Call from a cron job (optional). */
  async cleanupExpired(): Promise<number> {
    const res = await this.prisma.queryCache.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    if (res.count > 0) this.logger.log(`Cleaned up ${res.count} expired cache entries`);
    return res.count;
  }

  /** Invalidate all entries whose page scope matches. Used when a case/doc is mutated. */
  async invalidateByPage(route: string, entityId?: bigint | number | null): Promise<number> {
    const res = await this.prisma.queryCache.deleteMany({
      where: {
        pageRoute: route,
        ...(entityId != null ? { pageEntityId: this.toBigInt(entityId) } : {}),
      },
    });
    return res.count;
  }

  /** Invalidate all entries scoped to an organization. */
  async invalidateByOrg(organizationId: bigint | number): Promise<number> {
    const res = await this.prisma.queryCache.deleteMany({
      where: { organizationId: this.toBigInt(organizationId) },
    });
    return res.count;
  }

  async stats(): Promise<CacheStats> {
    const [totalEntries, sumHits, topRows] = await Promise.all([
      this.prisma.queryCache.count(),
      this.prisma.queryCache.aggregate({ _sum: { hitCount: true } }),
      this.prisma.queryCache.findMany({
        orderBy: { hitCount: 'desc' },
        take: 10,
        select: { normalizedQuery: true, hitCount: true, lastHitAt: true },
      }),
    ]);
    const totalHits = sumHits._sum.hitCount ?? 0;
    return {
      totalEntries,
      totalHits,
      avgHitCount: totalEntries > 0 ? totalHits / totalEntries : 0,
      topHits: topRows,
    };
  }

  // ── helpers ─────────────────────────────────────────────────────
  private normalize(q: string): string {
    return q
      .normalize('NFC')
      .toLowerCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[!?.,;:"'`“”‘’]+\s*$/u, '')
      .trim();
  }

  private computeHash(normalizedQuery: string, scope: CacheScope): string {
    const key = [
      normalizedQuery,
      `user:${scope.userId ?? ''}`,
      `org:${scope.organizationId ?? ''}`,
      `route:${scope.pageRoute ?? ''}`,
      `entity:${scope.pageEntityId ?? ''}`,
    ].join('|');
    return createHash('sha256').update(key).digest('hex');
  }

  private hasPageScope(scope: CacheScope): boolean {
    return !!(scope.pageRoute || scope.pageEntityId);
  }

  private toBigInt(v: bigint | number | null | undefined): bigint | null {
    if (v == null) return null;
    return typeof v === 'bigint' ? v : BigInt(v);
  }

  private looksLikeError(answer: string): boolean {
    return (
      answer.startsWith('ขออภัย') &&
      (/GEMINI_API_KEY|ไม่สามารถ|เกินโควต้า|เครือข่าย|ข้อผิดพลาด|ยังไม่ได้รับการกำหนดค่า/.test(answer))
    );
  }
}
