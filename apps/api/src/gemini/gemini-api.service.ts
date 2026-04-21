import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

const MAX_RETRIES = 4;
const RETRY_DELAYS = [3000, 6000, 15000, 30000]; // ms

@Injectable()
export class GeminiApiService {
  private readonly logger = new Logger(GeminiApiService.name);

  constructor(private readonly config: ConfigService) {}

  getApiKey(): string | undefined {
    // Prefer OpenRouter, fallback to Gemini direct
    return (
      this.config.get<string>('OPENROUTER_API_KEY')?.trim() ||
      this.config.get<string>('GEMINI_API_KEY')?.trim() ||
      undefined
    );
  }

  getModel(): string {
    return this.config.get<string>('GEMINI_MODEL', 'gemini-2.5-flash');
  }

  private isOpenRouter(): boolean {
    return !!this.config.get<string>('OPENROUTER_API_KEY')?.trim();
  }

  private openRouterModel(): string {
    const model = this.getModel();
    // OpenRouter uses "google/" prefix for Gemini models
    if (model.startsWith('google/')) return model;
    if (model.startsWith('gemini-')) return `google/${model}`;
    return model;
  }

  // ─── Gemini Direct API ──────────────────────────────────────────────────

  private geminiEndpoint(): string {
    const key = this.config.get<string>('GEMINI_API_KEY')?.trim();
    const model = this.getModel();
    if (!key) throw new Error('GEMINI_API_KEY not configured');
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  }

  private geminiOpts(): AxiosRequestConfig {
    const cfg: AxiosRequestConfig = {
      timeout: 120000,
      headers: { 'Content-Type': 'application/json' },
    };
    if (!this.config.get('HTTPS_PROXY')) cfg.proxy = false;
    return cfg;
  }

  // ─── OpenRouter API ─────────────────────────────────────────────────────

  private openRouterEndpoint(): string {
    return 'https://openrouter.ai/api/v1/chat/completions';
  }

  private openRouterOpts(): AxiosRequestConfig {
    const key = this.config.get<string>('OPENROUTER_API_KEY')?.trim();
    if (!key) throw new Error('OPENROUTER_API_KEY not configured');
    return {
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://nextoffice.cnppai.com',
        'X-Title': 'NextOffice AI',
      },
    };
  }

  // ─── Response extraction ────────────────────────────────────────────────

  extractTextFromResponse(data: unknown): string {
    const d = data as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  private extractOpenRouterText(data: unknown): string {
    const d = data as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return d?.choices?.[0]?.message?.content ?? '';
  }

  logAxiosError(context: string, err: unknown) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<{ error?: { message?: string; status?: string } }>;
      this.logger.error(
        `${context}: status=${ax.response?.status ?? 'n/a'} ${ax.message} body=${JSON.stringify(ax.response?.data)}`,
      );
    } else if (err instanceof Error) {
      this.logger.error(`${context}: ${err.message}`);
    }
  }

  // ─── Retry wrapper ──────────────────────────────────────────────────────

  private async postWithRetry(url: string, body: any, opts: AxiosRequestConfig, context: string): Promise<any> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await axios.post(url, body, opts);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 429 && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt] ?? 30000;
          this.logger.warn(`${context}: 429 rate limited, retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  async generateText(opts: {
    system?: string;
    user: string;
    maxOutputTokens?: number;
    temperature?: number;
  }): Promise<string> {
    if (this.isOpenRouter()) {
      return this.generateTextOpenRouter(opts);
    }
    return this.generateTextGemini(opts);
  }

  async generateFromParts(opts: {
    system?: string;
    parts: GeminiPart[];
    maxOutputTokens?: number;
    temperature?: number;
  }): Promise<string> {
    if (this.isOpenRouter()) {
      return this.generateFromPartsOpenRouter(opts);
    }
    return this.generateFromPartsGemini(opts);
  }

  // ─── Gemini Direct implementations ──────────────────────────────────────

  private async generateTextGemini(opts: {
    system?: string;
    user: string;
    maxOutputTokens?: number;
    temperature?: number;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      generationConfig: {
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
        temperature: opts.temperature ?? 0.3,
      },
    };
    if (opts.system) {
      body.systemInstruction = { parts: [{ text: opts.system }] };
    }
    const res = await this.postWithRetry(this.geminiEndpoint(), body, this.geminiOpts(), 'generateText');
    return this.extractTextFromResponse(res.data);
  }

  private async generateFromPartsGemini(opts: {
    system?: string;
    parts: GeminiPart[];
    maxOutputTokens?: number;
    temperature?: number;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: opts.parts }],
      generationConfig: {
        maxOutputTokens: opts.maxOutputTokens ?? 4096,
        temperature: opts.temperature ?? 0.2,
      },
    };
    if (opts.system) {
      body.systemInstruction = { parts: [{ text: opts.system }] };
    }
    const res = await this.postWithRetry(this.geminiEndpoint(), body, this.geminiOpts(), 'generateFromParts');
    return this.extractTextFromResponse(res.data);
  }

  // ─── OpenRouter implementations ─────────────────────────────────────────

  private async generateTextOpenRouter(opts: {
    system?: string;
    user: string;
    maxOutputTokens?: number;
    temperature?: number;
  }): Promise<string> {
    const messages: any[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: opts.user });

    const body = {
      model: this.openRouterModel(),
      messages,
      max_tokens: opts.maxOutputTokens ?? 2048,
      temperature: opts.temperature ?? 0.3,
    };
    const res = await this.postWithRetry(
      this.openRouterEndpoint(), body, this.openRouterOpts(), 'generateText:openrouter',
    );
    return this.extractOpenRouterText(res.data);
  }

  private async generateFromPartsOpenRouter(opts: {
    system?: string;
    parts: GeminiPart[];
    maxOutputTokens?: number;
    temperature?: number;
  }): Promise<string> {
    // Convert Gemini parts to OpenAI multimodal format
    const content: any[] = [];
    for (const part of opts.parts) {
      if ('text' in part) {
        content.push({ type: 'text', text: part.text });
      } else if ('inlineData' in part) {
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          },
        });
      }
    }

    const messages: any[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content });

    const body = {
      model: this.openRouterModel(),
      messages,
      max_tokens: opts.maxOutputTokens ?? 4096,
      temperature: opts.temperature ?? 0.2,
    };
    const res = await this.postWithRetry(
      this.openRouterEndpoint(), body, this.openRouterOpts(), 'generateFromParts:openrouter',
    );
    return this.extractOpenRouterText(res.data);
  }
}
