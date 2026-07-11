import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { createHash } from 'crypto';
import { DifyAuditService } from './dify-audit.service';
import { DifyRateLimitService } from './dify-rate-limit.service';

export type DifyAppKind = 'chat' | 'workflow' | 'completion' | 'outbound_outline';

export type DifyChatResult = {
  answer: string;
  conversationId: string | null;
  messageId: string | null;
  provider: 'dify';
  cached?: boolean;
  latencyMs?: number;
};

export type DifyWorkflowResult = {
  workflowRunId: string | null;
  taskId: string | null;
  status: string | null;
  outputs: Record<string, unknown>;
  /** Best-effort text extracted from outputs */
  text: string;
  provider: 'dify';
  latencyMs?: number;
};

export type DifyCompletionResult = {
  answer: string;
  messageId: string | null;
  provider: 'dify';
  latencyMs?: number;
};

type CacheEntry = { answer: string; conversationId: string | null; expiresAt: number };

const STATUS_CACHE_MS = 30_000;
const ANSWER_CACHE_MS = 5 * 60_000;
const MAX_ANSWER_CACHE = 200;
const RETRY_DELAYS_MS = [800, 2000];

/**
 * HTTP client for Dify apps (Phase 1 chat + Phase 2 workflow/completion).
 * @see https://docs.dify.ai
 */
@Injectable()
export class DifyApiService {
  private readonly logger = new Logger(DifyApiService.name);
  private statusCache: { at: number; value: ReturnType<DifyApiService['buildStatus']> } | null =
    null;
  private readonly answerCache = new Map<string, CacheEntry>();

  constructor(
    private readonly config: ConfigService,
    private readonly audit: DifyAuditService,
    private readonly rateLimit: DifyRateLimitService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('ENABLE_DIFY') === 'true';
  }

  private getApiBase(): string {
    return (this.config.get<string>('DIFY_API_BASE') || '').replace(/\/+$/, '');
  }

  private getKey(kind: DifyAppKind): string {
    if (kind === 'chat') {
      return (
        this.config.get<string>('DIFY_API_KEY_CHAT')?.trim() ||
        this.config.get<string>('DIFY_API_KEY')?.trim() ||
        ''
      );
    }
    if (kind === 'workflow') {
      return this.config.get<string>('DIFY_API_KEY_WORKFLOW')?.trim() || '';
    }
    if (kind === 'outbound_outline') {
      // Dedicated outline workflow key, else fall back to generic workflow app
      return (
        this.config.get<string>('DIFY_API_KEY_OUTBOUND_OUTLINE')?.trim() ||
        this.config.get<string>('DIFY_API_KEY_WORKFLOW')?.trim() ||
        ''
      );
    }
    return this.config.get<string>('DIFY_API_KEY_COMPLETION')?.trim() || '';
  }

  isAppConfigured(kind: DifyAppKind): boolean {
    return !!(this.getApiBase() && this.getKey(kind));
  }

  isConfigured(): boolean {
    return this.isAppConfigured('chat');
  }

  private assertReady(kind: DifyAppKind) {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Dify ยังไม่เปิดใช้งาน (ตั้ง ENABLE_DIFY=true)',
      );
    }
    const base = this.getApiBase();
    const key = this.getKey(kind);
    if (!base || !key) {
      const envHint =
        kind === 'chat'
          ? 'DIFY_API_BASE + DIFY_API_KEY_CHAT'
          : kind === 'workflow'
            ? 'DIFY_API_BASE + DIFY_API_KEY_WORKFLOW'
            : kind === 'outbound_outline'
              ? 'DIFY_API_BASE + DIFY_API_KEY_OUTBOUND_OUTLINE (หรือ DIFY_API_KEY_WORKFLOW)'
              : 'DIFY_API_BASE + DIFY_API_KEY_COMPLETION';
      throw new ServiceUnavailableException(`Dify ${kind} ยังไม่ได้ตั้งค่า (${envHint})`);
    }
  }

  private axiosConfig(apiKey: string): AxiosRequestConfig {
    return {
      timeout: 120_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      proxy: false,
    };
  }

  private async postWithRetry(
    url: string,
    body: unknown,
    apiKey: string,
    label: string,
  ): Promise<any> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const { data } = await axios.post(url, body, this.axiosConfig(apiKey));
        return data;
      } catch (err) {
        lastErr = err;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const retriable =
          !status || status === 502 || status === 503 || status === 504 || status === 429;
        if (!retriable || attempt === RETRY_DELAYS_MS.length) break;
        const delay = RETRY_DELAYS_MS[attempt];
        this.logger.warn(`${label} attempt ${attempt + 1} failed status=${status}, retry in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  /**
   * Chat / Agent app — POST /chat-messages
   */
  async chat(opts: {
    query: string;
    user: string;
    conversationId?: string | null;
    inputs?: Record<string, string>;
    organizationId?: number | null;
    skipCache?: boolean;
  }): Promise<DifyChatResult> {
    this.assertReady('chat');
    this.assertUserRateLimit('chat', opts.user, opts.organizationId);
    const base = this.getApiBase();
    const apiKey = this.getKey('chat');
    const t0 = Date.now();

    const cacheable =
      !opts.skipCache &&
      !opts.conversationId &&
      !opts.inputs?.letter_context &&
      this.config.get('DIFY_CHAT_CACHE') !== 'false';

    if (cacheable) {
      const hit = this.getAnswerCache(opts.query, opts.organizationId);
      if (hit) {
        const result: DifyChatResult = {
          answer: hit.answer,
          conversationId: hit.conversationId,
          messageId: null,
          provider: 'dify',
          cached: true,
          latencyMs: Date.now() - t0,
        };
        this.audit.record({
          kind: 'chat',
          action: 'chat-messages',
          organizationId: opts.organizationId,
          userKey: opts.user,
          ok: true,
          latencyMs: result.latencyMs,
          detail: 'cache-hit',
        });
        return result;
      }
    }

    const url = `${base}/chat-messages`;
    const body = {
      inputs: opts.inputs ?? {},
      query: opts.query,
      response_mode: 'blocking',
      conversation_id: opts.conversationId || '',
      user: opts.user,
    };

    try {
      const data = await this.postWithRetry(url, body, apiKey, 'dify.chat');
      const answer = this.extractAnswer(data);
      if (!answer) {
        this.logger.warn(`Dify chat empty answer keys=${Object.keys(data || {}).join(',')}`);
      }
      const result: DifyChatResult = {
        answer: answer || 'ไม่ได้รับคำตอบจาก Dify',
        conversationId: data?.conversation_id ?? data?.conversationId ?? null,
        messageId: data?.message_id ?? data?.id ?? null,
        provider: 'dify',
        cached: false,
        latencyMs: Date.now() - t0,
      };
      if (cacheable && result.answer) {
        this.setAnswerCache(opts.query, opts.organizationId, result.answer, result.conversationId);
      }
      this.audit.record({
        kind: 'chat',
        action: 'chat-messages',
        organizationId: opts.organizationId,
        userKey: opts.user,
        ok: true,
        latencyMs: result.latencyMs,
        detail: opts.inputs?.case_id ? `case=${opts.inputs.case_id}` : undefined,
      });
      return result;
    } catch (err) {
      this.audit.record({
        kind: 'chat',
        action: 'chat-messages',
        organizationId: opts.organizationId,
        userKey: opts.user,
        ok: false,
        latencyMs: Date.now() - t0,
        detail: err instanceof Error ? err.message.slice(0, 200) : 'error',
      });
      this.rethrow(err);
    }
  }

  /**
   * Workflow app — POST /workflows/run
   * @param kind default `workflow`; use `outbound_outline` for Phase 4 draft outline app
   */
  async runWorkflow(opts: {
    inputs: Record<string, string | number | boolean>;
    user: string;
    kind?: Extract<DifyAppKind, 'workflow' | 'outbound_outline'>;
  }): Promise<DifyWorkflowResult> {
    const kind = opts.kind ?? 'workflow';
    this.assertReady(kind);
    this.assertUserRateLimit(kind, opts.user);
    const base = this.getApiBase();
    const apiKey = this.getKey(kind);
    const t0 = Date.now();
    const url = `${base}/workflows/run`;
    const body = {
      inputs: opts.inputs ?? {},
      response_mode: 'blocking',
      user: opts.user,
    };

    try {
      const data = await this.postWithRetry(url, body, apiKey, `dify.${kind}`);
      // Shape: { workflow_run_id, task_id, data: { status, outputs, ... } }
      const run = data?.data ?? data;
      const outputs = (run?.outputs ?? data?.outputs ?? {}) as Record<string, unknown>;
      const result: DifyWorkflowResult = {
        workflowRunId: data?.workflow_run_id ?? run?.id ?? null,
        taskId: data?.task_id ?? null,
        status: run?.status ?? data?.status ?? null,
        outputs,
        text: this.extractTextFromOutputs(outputs),
        provider: 'dify',
        latencyMs: Date.now() - t0,
      };
      this.audit.record({
        kind: kind === 'outbound_outline' ? 'outbound_outline' : 'workflow',
        action: 'workflows/run',
        userKey: opts.user,
        ok: true,
        latencyMs: result.latencyMs,
        detail: result.workflowRunId ? `run=${result.workflowRunId}` : undefined,
      });
      return result;
    } catch (err) {
      this.audit.record({
        kind: kind === 'outbound_outline' ? 'outbound_outline' : 'workflow',
        action: 'workflows/run',
        userKey: opts.user,
        ok: false,
        latencyMs: Date.now() - t0,
        detail: err instanceof Error ? err.message.slice(0, 200) : 'error',
      });
      this.rethrow(err);
    }
  }

  /**
   * Text Generator / Completion app — POST /completion-messages
   */
  async completion(opts: {
    inputs: Record<string, string | number | boolean>;
    user: string;
  }): Promise<DifyCompletionResult> {
    this.assertReady('completion');
    const base = this.getApiBase();
    const apiKey = this.getKey('completion');
    const t0 = Date.now();
    const url = `${base}/completion-messages`;
    const body = {
      inputs: opts.inputs ?? {},
      response_mode: 'blocking',
      user: opts.user,
    };

    try {
      const data = await this.postWithRetry(url, body, apiKey, 'dify.completion');
      const answer = this.extractAnswer(data);
      return {
        answer: answer || 'ไม่ได้รับคำตอบจาก Dify',
        messageId: data?.message_id ?? data?.id ?? null,
        provider: 'dify',
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      this.rethrow(err);
    }
  }

  /**
   * GET /parameters — application input schema (chat/completion apps)
   */
  async getParameters(kind: DifyAppKind = 'chat'): Promise<unknown> {
    this.assertReady(kind);
    const base = this.getApiBase();
    const apiKey = this.getKey(kind);
    try {
      const { data } = await axios.get(`${base}/parameters`, this.axiosConfig(apiKey));
      return data;
    } catch (err) {
      this.rethrow(err);
    }
  }

  getStatus(opts?: { fresh?: boolean }) {
    if (!opts?.fresh && this.statusCache && Date.now() - this.statusCache.at < STATUS_CACHE_MS) {
      return { ...this.statusCache.value, cached: true as const };
    }
    const value = this.buildStatus();
    this.statusCache = { at: Date.now(), value };
    return { ...value, cached: false as const };
  }

  private buildStatus() {
    const base = this.getApiBase() || null;
    return {
      enabled: this.isEnabled(),
      configured: this.isConfigured(),
      apiBase: base,
      apps: {
        chat: this.isAppConfigured('chat'),
        workflow: this.isAppConfigured('workflow'),
        completion: this.isAppConfigured('completion'),
        outboundOutline: this.isAppConfigured('outbound_outline'),
      },
      cache: {
        answerCacheEnabled: this.config.get('DIFY_CHAT_CACHE') !== 'false',
        answerCacheSize: this.answerCache.size,
      },
      tools: {
        enabled:
          this.config.get('ENABLE_DIFY_TOOLS') === 'true' || this.isEnabled(),
        keyConfigured: !!(
          this.config.get<string>('DIFY_TOOLS_API_KEY')?.trim() &&
          (this.config.get<string>('DIFY_TOOLS_API_KEY')?.trim().length ?? 0) >= 16
        ),
        defaultOrgId: Number(this.config.get('DIFY_TOOLS_ORG_ID') || 0) || null,
      },
      rateLimit: {
        chatPerUser: Number(this.config.get('DIFY_CHAT_RATE_LIMIT') ?? 30),
        toolsPerOrg: Number(this.config.get('DIFY_TOOLS_RATE_LIMIT') ?? 60),
      },
      phase: 6,
    };
  }

  private assertUserRateLimit(
    kind: string,
    user: string,
    organizationId?: number | null,
  ) {
    const limit = Number(this.config.get('DIFY_CHAT_RATE_LIMIT') ?? 30);
    const windowMs = Number(this.config.get('DIFY_CHAT_RATE_WINDOW_MS') ?? 60_000);
    const key = `${kind}:${organizationId ?? 0}:${user}`;
    const rl = this.rateLimit.check(key, limit, windowMs);
    if (!rl.allowed) {
      throw new ServiceUnavailableException(
        `Dify rate limit (${limit}/window). ลองใหม่ใน ${rl.retryAfterSec}s`,
      );
    }
  }

  private extractAnswer(data: any): string {
    if (typeof data?.answer === 'string') return data.answer;
    if (typeof data?.data?.outputs?.answer === 'string') return data.data.outputs.answer;
    if (typeof data?.data?.outputs?.text === 'string') return data.data.outputs.text;
    return this.extractTextFromOutputs(data?.data?.outputs ?? data?.outputs ?? {});
  }

  private extractTextFromOutputs(outputs: Record<string, unknown>): string {
    if (!outputs || typeof outputs !== 'object') return '';
    for (const key of ['answer', 'text', 'result', 'summary', 'output']) {
      const v = outputs[key];
      if (typeof v === 'string' && v.trim()) return v;
    }
    // first string value
    for (const v of Object.values(outputs)) {
      if (typeof v === 'string' && v.trim()) return v;
    }
    try {
      return JSON.stringify(outputs);
    } catch {
      return '';
    }
  }

  private cacheKey(query: string, organizationId?: number | null): string {
    const norm = query.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 2000);
    return createHash('sha256')
      .update(`org:${organizationId ?? 0}|${norm}`)
      .digest('hex');
  }

  private getAnswerCache(
    query: string,
    organizationId?: number | null,
  ): CacheEntry | null {
    const key = this.cacheKey(query, organizationId);
    const row = this.answerCache.get(key);
    if (!row) return null;
    if (row.expiresAt <= Date.now()) {
      this.answerCache.delete(key);
      return null;
    }
    return row;
  }

  private setAnswerCache(
    query: string,
    organizationId: number | null | undefined,
    answer: string,
    conversationId: string | null,
  ) {
    if (this.answerCache.size >= MAX_ANSWER_CACHE) {
      // delete oldest insertion
      const first = this.answerCache.keys().next().value;
      if (first) this.answerCache.delete(first);
    }
    this.answerCache.set(this.cacheKey(query, organizationId), {
      answer,
      conversationId,
      expiresAt: Date.now() + ANSWER_CACHE_MS,
    });
  }

  private rethrow(err: unknown): never {
    if (axios.isAxiosError(err)) {
      this.logAxiosError(err);
      const status = err.response?.status;
      const detail =
        (err.response?.data as any)?.message ||
        (err.response?.data as any)?.error ||
        err.message;
      throw new BadGatewayException(
        `Dify API error${status ? ` (${status})` : ''}: ${detail}`,
      );
    }
    throw err;
  }

  private logAxiosError(err: AxiosError) {
    const status = err.response?.status;
    const data = err.response?.data;
    this.logger.warn(
      `Dify request failed status=${status} data=${JSON.stringify(data)?.slice(0, 400)}`,
    );
  }
}
