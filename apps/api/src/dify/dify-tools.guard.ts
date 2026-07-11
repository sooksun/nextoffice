import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { DifyRateLimitService } from './dify-rate-limit.service';

/**
 * Auth for Dify Agent custom tools (Phase 5) + rate limit / IP allowlist (Phase 6).
 * Accepts:
 *   Authorization: Bearer <DIFY_TOOLS_API_KEY>
 *   X-Dify-Tool-Key: <DIFY_TOOLS_API_KEY>
 *
 * Never use end-user JWT here — Dify stores a server-side secret only.
 */
@Injectable()
export class DifyToolsGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly rateLimit: DifyRateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get<string>('ENABLE_DIFY_TOOLS') !== 'true') {
      // Also allow when ENABLE_DIFY is on (convenience)
      if (this.config.get<string>('ENABLE_DIFY') !== 'true') {
        throw new ServiceUnavailableException(
          'Dify tools ปิดอยู่ (ตั้ง ENABLE_DIFY_TOOLS=true หรือ ENABLE_DIFY=true)',
        );
      }
    }

    const expected = this.config.get<string>('DIFY_TOOLS_API_KEY')?.trim();
    if (!expected || expected.length < 16) {
      throw new ServiceUnavailableException(
        'DIFY_TOOLS_API_KEY ยังไม่ได้ตั้งค่า (อย่างน้อย 16 ตัวอักษร)',
      );
    }

    const req = context.switchToHttp().getRequest();
    const ip =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      '';

    this.assertIpAllowed(ip);

    const provided = this.extractKey(req);
    if (!provided || !this.keysMatch(provided, expected)) {
      throw new UnauthorizedException('Dify tool key ไม่ถูกต้อง');
    }

    // Attach tool context for handlers
    const orgId = this.resolveOrgId(req);
    req.difyTool = {
      organizationId: orgId,
      source: 'dify-agent',
      ip,
    };

    // Phase 6 rate limit
    const limit = Number(this.config.get('DIFY_TOOLS_RATE_LIMIT') ?? 60);
    const windowMs = Number(this.config.get('DIFY_TOOLS_RATE_WINDOW_MS') ?? 60_000);
    const bucketKey = `tools:${orgId}:${provided.slice(0, 8)}`;
    const rl = this.rateLimit.check(bucketKey, limit, windowMs);
    req.difyTool.rateLimit = rl;
    if (!rl.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Dify tools rate limit exceeded (${limit}/window). Retry after ${rl.retryAfterSec}s`,
          retryAfterSec: rl.retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private assertIpAllowed(ip: string) {
    const raw = this.config.get<string>('DIFY_TOOLS_IP_ALLOWLIST')?.trim();
    if (!raw) return;
    const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return;
    // Allow empty ip only if not restricted; common in local tests
    if (!ip) return;
    const ok = list.some((rule) => ip === rule || ip.startsWith(rule));
    if (!ok) {
      throw new ForbiddenException(`IP ${ip} ไม่อยู่ใน DIFY_TOOLS_IP_ALLOWLIST`);
    }
  }

  private extractKey(req: any): string | null {
    const headerKey = req.headers?.['x-dify-tool-key'];
    if (typeof headerKey === 'string' && headerKey.trim()) return headerKey.trim();

    const auth: string | undefined = req.headers?.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
    return null;
  }

  /**
   * Org scope: header X-Org-Id if in allowlist, else DIFY_TOOLS_ORG_ID.
   */
  private resolveOrgId(req: any): number {
    const defaultOrg = Number(this.config.get('DIFY_TOOLS_ORG_ID') || 0);
    const allowRaw = this.config.get<string>('DIFY_TOOLS_ALLOWED_ORG_IDS') || '';
    const allowed = new Set(
      allowRaw
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    );
    if (defaultOrg > 0) allowed.add(defaultOrg);

    const headerOrg = Number(req.headers?.['x-org-id'] || req.query?.organizationId || 0);
    if (headerOrg > 0) {
      if (allowed.size > 0 && !allowed.has(headerOrg)) {
        throw new UnauthorizedException('organizationId ไม่อยู่ใน allowlist ของ Dify tools');
      }
      return headerOrg;
    }

    if (defaultOrg > 0) return defaultOrg;
    throw new UnauthorizedException(
      'ต้องระบุ org: ตั้ง DIFY_TOOLS_ORG_ID หรือส่ง X-Org-Id / organizationId',
    );
  }

  private keysMatch(a: string, b: string): boolean {
    try {
      const ba = Buffer.from(a);
      const bb = Buffer.from(b);
      if (ba.length !== bb.length) return false;
      return timingSafeEqual(ba, bb);
    } catch {
      return false;
    }
  }
}
