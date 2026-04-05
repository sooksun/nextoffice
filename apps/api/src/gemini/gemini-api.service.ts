import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

@Injectable()
export class GeminiApiService {
  private readonly logger = new Logger(GeminiApiService.name);

  constructor(private readonly config: ConfigService) {}

  getApiKey(): string | undefined {
    return this.config.get<string>('GEMINI_API_KEY')?.trim() || undefined;
  }

  getModel(): string {
    return this.config.get<string>('GEMINI_MODEL', 'gemini-2.0-flash');
  }

  private endpoint(): string {
    const key = this.getApiKey();
    const model = this.getModel();
    if (!key) throw new Error('GEMINI_API_KEY not configured');
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  }

  private axiosOpts(): AxiosRequestConfig {
    const cfg: AxiosRequestConfig = {
      timeout: 120000,
      headers: { 'Content-Type': 'application/json' },
    };
    if (!this.config.get('HTTPS_PROXY')) {
      cfg.proxy = false;
    }
    return cfg;
  }

  extractTextFromResponse(data: unknown): string {
    const d = data as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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

  async generateText(opts: {
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
    const res = await axios.post(this.endpoint(), body, this.axiosOpts());
    return this.extractTextFromResponse(res.data);
  }

  async generateFromParts(opts: {
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
    const res = await axios.post(this.endpoint(), body, this.axiosOpts());
    return this.extractTextFromResponse(res.data);
  }
}
