import { Injectable, Logger } from '@nestjs/common';

export type DifyAuditKind =
  | 'tool'
  | 'chat'
  | 'workflow'
  | 'completion'
  | 'outbound_outline'
  | 'admin';

export type DifyAuditEntry = {
  id: string;
  at: string; // ISO
  kind: DifyAuditKind;
  action: string;
  organizationId?: number | null;
  userKey?: string | null;
  ok: boolean;
  statusCode?: number;
  latencyMs?: number;
  detail?: string;
  ip?: string | null;
};

const MAX_ENTRIES = 300;

/**
 * Phase 6: in-memory ring buffer of recent Dify/tool activity.
 * No DB schema change — process-local (resets on restart).
 */
@Injectable()
export class DifyAuditService {
  private readonly logger = new Logger(DifyAuditService.name);
  private readonly entries: DifyAuditEntry[] = [];
  private seq = 0;

  record(
    partial: Omit<DifyAuditEntry, 'id' | 'at'> & { at?: string },
  ): DifyAuditEntry {
    const entry: DifyAuditEntry = {
      id: `da-${Date.now()}-${++this.seq}`,
      at: partial.at ?? new Date().toISOString(),
      kind: partial.kind,
      action: partial.action,
      organizationId: partial.organizationId ?? null,
      userKey: partial.userKey ?? null,
      ok: partial.ok,
      statusCode: partial.statusCode,
      latencyMs: partial.latencyMs,
      detail: partial.detail?.slice(0, 500),
      ip: partial.ip ?? null,
    };
    this.entries.push(entry);
    while (this.entries.length > MAX_ENTRIES) this.entries.shift();

    const line = `dify.audit kind=${entry.kind} action=${entry.action} ok=${entry.ok} org=${entry.organizationId ?? '-'} ${entry.latencyMs ?? '-'}ms ${entry.detail ?? ''}`;
    if (entry.ok) this.logger.log(line);
    else this.logger.warn(line);

    return entry;
  }

  list(opts?: { limit?: number; kind?: DifyAuditKind }): DifyAuditEntry[] {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), MAX_ENTRIES);
    let rows = this.entries;
    if (opts?.kind) rows = rows.filter((e) => e.kind === opts.kind);
    return rows.slice(-limit).reverse();
  }

  clear(): { cleared: number } {
    const n = this.entries.length;
    this.entries.length = 0;
    return { cleared: n };
  }

  stats() {
    const total = this.entries.length;
    const ok = this.entries.filter((e) => e.ok).length;
    const byKind: Record<string, number> = {};
    for (const e of this.entries) {
      byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    }
    return {
      bufferSize: total,
      maxBuffer: MAX_ENTRIES,
      ok,
      failed: total - ok,
      byKind,
    };
  }
}
