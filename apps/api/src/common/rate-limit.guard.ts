import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

export const RATE_LIMIT_KEY = 'rate_limit_options';

export interface RateLimitOptions {
  /** Max requests per window from a single client IP. */
  limit: number;
  windowSec: number;
  /**
   * Body field identifying the account being targeted (e.g. `email`).
   * Gets its own, tighter bucket so a shared NAT (a whole school behind one
   * public IP) does not lock everyone out, while credential stuffing against a
   * single account still gets stopped.
   */
  identityField?: string;
  /** Defaults to half the IP limit. */
  identityLimit?: number;
}

/** Fixed-window rate limit for unauthenticated / credential-checking routes. */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

function hit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return {
    allowed: b.count <= limit,
    retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
  };
}

function prune() {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!options || options.limit <= 0) return true;

    if (buckets.size > MAX_BUCKETS) prune();

    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const windowMs = options.windowSec * 1000;
    // `trust proxy` is set in main.ts, so req.ip is the real client behind NPM.
    const route = `${ctx.getClass().name}.${ctx.getHandler().name}`;
    const ip = req.ip || 'unknown';

    const checks = [hit(`${route}|ip:${ip}`, options.limit, windowMs)];

    const identity = options.identityField
      ? (req.body as Record<string, unknown> | undefined)?.[options.identityField]
      : undefined;
    if (typeof identity === 'string' && identity.trim()) {
      checks.push(
        hit(
          `${route}|id:${identity.trim().toLowerCase()}`,
          options.identityLimit ?? Math.ceil(options.limit / 2),
          windowMs,
        ),
      );
    }

    const blocked = checks.find((c) => !c.allowed);
    if (!blocked) return true;

    this.logger.warn(`Rate limit hit on ${route} from ${ip}`);
    res.setHeader('Retry-After', String(blocked.retryAfterSec));
    throw new HttpException(
      `คำขอถี่เกินไป กรุณาลองใหม่ในอีก ${blocked.retryAfterSec} วินาที`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
