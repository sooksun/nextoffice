import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

export type DifyChatResult = {
  answer: string;
  conversationId: string | null;
  messageId: string | null;
  /** true when Dify is enabled and configured */
  provider: 'dify';
};

/**
 * Thin HTTP client for Dify Chat / Agent apps (Phase 1).
 * Spec: POST {DIFY_API_BASE}/chat-messages with Bearer app key.
 * @see https://docs.dify.ai
 */
@Injectable()
export class DifyApiService {
  private readonly logger = new Logger(DifyApiService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('ENABLE_DIFY') === 'true';
  }

  isConfigured(): boolean {
    return !!(this.getApiBase() && this.getChatApiKey());
  }

  private getApiBase(): string {
    return (this.config.get<string>('DIFY_API_BASE') || '').replace(/\/+$/, '');
  }

  private getChatApiKey(): string {
    return (
      this.config.get<string>('DIFY_API_KEY_CHAT')?.trim() ||
      this.config.get<string>('DIFY_API_KEY')?.trim() ||
      ''
    );
  }

  /**
   * Send a user message to the Phase-1 policy/letter Dify Chat app.
   * @param user stable id for Dify conversation scoping (e.g. user:12:org:3)
   */
  async chat(opts: {
    query: string;
    user: string;
    conversationId?: string | null;
    inputs?: Record<string, string>;
  }): Promise<DifyChatResult> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Dify ยังไม่เปิดใช้งาน (ตั้ง ENABLE_DIFY=true)',
      );
    }
    const base = this.getApiBase();
    const apiKey = this.getChatApiKey();
    if (!base || !apiKey) {
      throw new ServiceUnavailableException(
        'Dify ยังไม่ได้ตั้งค่า (DIFY_API_BASE + DIFY_API_KEY_CHAT)',
      );
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
      const { data } = await axios.post(url, body, {
        timeout: 120_000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        // avoid accidental proxy for internal docker hostnames
        proxy: false,
      });

      const answer =
        typeof data?.answer === 'string'
          ? data.answer
          : typeof data?.data?.outputs?.answer === 'string'
            ? data.data.outputs.answer
            : '';

      if (!answer) {
        this.logger.warn(
          `Dify empty answer keys=${Object.keys(data || {}).join(',')}`,
        );
      }

      return {
        answer: answer || 'ไม่ได้รับคำตอบจาก Dify',
        conversationId: data?.conversation_id ?? data?.conversationId ?? null,
        messageId: data?.message_id ?? data?.id ?? null,
        provider: 'dify',
      };
    } catch (err) {
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
  }

  /** Health for UI: enabled + keys present (does not call Dify). */
  getStatus() {
    return {
      enabled: this.isEnabled(),
      configured: this.isConfigured(),
      apiBase: this.getApiBase() || null,
      app: 'policy-letter-chat',
    };
  }

  private logAxiosError(err: AxiosError) {
    const status = err.response?.status;
    const data = err.response?.data;
    this.logger.warn(
      `Dify request failed status=${status} data=${JSON.stringify(data)?.slice(0, 400)}`,
    );
  }
}
