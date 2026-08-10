import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard, RateLimitOptions } from './rate-limit.guard';

/** Distinct handler per test so each gets its own bucket namespace. */
function makeCtx(handlerName: string, ip: string, body: unknown = {}): ExecutionContext {
  const handler = { [handlerName]: () => undefined }[handlerName] as () => void;
  const res = {
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
  };
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({ ip, body }),
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

function guardWith(options: RateLimitOptions | undefined) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(options);
  return new RateLimitGuard(reflector);
}

describe('RateLimitGuard', () => {
  it('passes through when the route has no @RateLimit metadata', () => {
    const guard = guardWith(undefined);
    expect(guard.canActivate(makeCtx('noMeta', '1.1.1.1'))).toBe(true);
  });

  it('allows up to the limit then throws 429 for the same IP', () => {
    const guard = guardWith({ limit: 3, windowSec: 60 });
    const ctx = makeCtx('ipLimit', '2.2.2.2');
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    try {
      guard.canActivate(ctx);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });

  it('keeps buckets separate per IP so one client cannot lock out another', () => {
    const guard = guardWith({ limit: 1, windowSec: 60 });
    expect(guard.canActivate(makeCtx('perIp', '3.3.3.3'))).toBe(true);
    expect(() => guard.canActivate(makeCtx('perIp', '3.3.3.3'))).toThrow(HttpException);
    expect(guard.canActivate(makeCtx('perIp', '4.4.4.4'))).toBe(true);
  });

  it('blocks on the identity bucket even when the IP rotates (credential stuffing)', () => {
    const guard = guardWith({
      limit: 100,
      windowSec: 60,
      identityField: 'email',
      identityLimit: 2,
    });
    const target = { email: 'victim@example.com' };
    expect(guard.canActivate(makeCtx('identity', '5.0.0.1', target))).toBe(true);
    expect(guard.canActivate(makeCtx('identity', '5.0.0.2', target))).toBe(true);
    expect(() => guard.canActivate(makeCtx('identity', '5.0.0.3', target))).toThrow(HttpException);
    // A different account is unaffected.
    expect(
      guard.canActivate(makeCtx('identity', '5.0.0.4', { email: 'other@example.com' })),
    ).toBe(true);
  });

  it('treats the identity case-insensitively', () => {
    const guard = guardWith({ limit: 100, windowSec: 60, identityField: 'email', identityLimit: 1 });
    expect(guard.canActivate(makeCtx('caseFold', '6.6.6.6', { email: 'Foo@Example.com' }))).toBe(true);
    expect(() =>
      guard.canActivate(makeCtx('caseFold', '6.6.6.7', { email: 'foo@example.com ' })),
    ).toThrow(HttpException);
  });

  it('sets Retry-After when it blocks', () => {
    const guard = guardWith({ limit: 1, windowSec: 45 });
    const ctx = makeCtx('retryAfter', '7.7.7.7');
    guard.canActivate(ctx);
    const res = ctx.switchToHttp().getResponse() as unknown as {
      headers: Record<string, string>;
    };
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
    expect(Number(res.headers['Retry-After'])).toBeLessThanOrEqual(45);
  });

  it('resets after the window elapses', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      const guard = guardWith({ limit: 1, windowSec: 10 });
      const ctx = makeCtx('window', '8.8.8.8');
      expect(guard.canActivate(ctx)).toBe(true);
      expect(() => guard.canActivate(ctx)).toThrow(HttpException);
      jest.setSystemTime(new Date('2026-01-01T00:00:11Z'));
      expect(guard.canActivate(ctx)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('is disabled when limit is 0 or negative', () => {
    const guard = guardWith({ limit: 0, windowSec: 60 });
    const ctx = makeCtx('disabled', '9.9.9.9');
    for (let i = 0; i < 5; i++) expect(guard.canActivate(ctx)).toBe(true);
  });
});
