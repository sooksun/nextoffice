import { Injectable } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };

/**
 * Phase 6: simple fixed-window rate limiter (process-local).
 */
@Injectable()
export class DifyRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * @returns { allowed, remaining, retryAfterSec }
   */
  check(
    key: string,
    limit: number,
    windowMs: number,
  ): { allowed: boolean; remaining: number; retryAfterSec: number; limit: number } {
    if (limit <= 0) {
      return { allowed: true, remaining: Infinity, retryAfterSec: 0, limit };
    }
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, b);
    }
    b.count += 1;
    const allowed = b.count <= limit;
    const remaining = Math.max(0, limit - b.count);
    const retryAfterSec = allowed ? 0 : Math.ceil((b.resetAt - now) / 1000);
    return { allowed, remaining, retryAfterSec, limit };
  }

  /** Drop expired buckets occasionally */
  prune() {
    const now = Date.now();
    for (const [k, b] of this.buckets) {
      if (b.resetAt <= now) this.buckets.delete(k);
    }
  }
}
