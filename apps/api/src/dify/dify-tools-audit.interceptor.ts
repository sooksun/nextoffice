import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { DifyAuditService } from './dify-audit.service';

@Injectable()
export class DifyToolsAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: DifyAuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const start = Date.now();
    const action = `${req.method} ${req.route?.path || req.url}`;
    const orgId = req.difyTool?.organizationId ?? null;
    const ip =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      null;

    return next.handle().pipe(
      tap(() => {
        this.audit.record({
          kind: 'tool',
          action,
          organizationId: orgId,
          ok: true,
          statusCode: 200,
          latencyMs: Date.now() - start,
          detail: req.query?.q ? `q=${String(req.query.q).slice(0, 80)}` : undefined,
          ip,
        });
      }),
      catchError((err) => {
        this.audit.record({
          kind: 'tool',
          action,
          organizationId: orgId,
          ok: false,
          statusCode: err?.status || err?.statusCode || 500,
          latencyMs: Date.now() - start,
          detail: err?.message?.slice?.(0, 200),
          ip,
        });
        return throwError(() => err);
      }),
    );
  }
}
