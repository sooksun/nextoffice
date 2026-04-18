import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PROMPTS, PromptDefault } from './default-prompts';

interface CacheEntry {
  value: PromptDefault;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class SystemPromptsService implements OnModuleInit {
  private readonly logger = new Logger(SystemPromptsService.name);
  private cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /** Seed ค่า default ถ้ายังไม่มีใน DB — ถ้า table ยังไม่มีก็ข้ามไป (ใช้ hardcoded fallback) */
  async onModuleInit() {
    // Check if Prisma client has this model yet (table may not exist)
    if (!(this.prisma as any).systemPrompt) {
      this.logger.warn('SystemPrompt table not ready — skipping seed, using hardcoded defaults');
      return;
    }
    try {
      // Keys ที่ต้อง force-update เมื่อ default เปลี่ยน (เช่น OCR maxTokens เพิ่มจาก 4096→8192)
      const FORCE_UPDATE_MAXTOKENS: Record<string, number> = {
        'ocr.pdf': 8192,
        'ocr.image': 8192,
        'extract.metadata': 1650,
      };

      // Keys ที่ต้อง force-update ถ้า DB prompt ไม่มี marker (= ยังเป็น prompt เวอร์ชันเก่า)
      // Marker คือ substring ที่ต้องมีอยู่ใน prompt เวอร์ชันใหม่เท่านั้น
      const FORCE_UPDATE_MARKER: Record<string, string> = {
        'classify.llm': '[v2-lenient]',
      };

      for (const d of DEFAULT_PROMPTS) {
        const existing = await (this.prisma as any).systemPrompt.findUnique({
          where: { promptKey: d.promptKey },
        });
        if (!existing) {
          await (this.prisma as any).systemPrompt.create({
            data: {
              promptKey: d.promptKey,
              groupName: d.groupName,
              label: d.label,
              description: d.description,
              promptText: d.promptText,
              temperature: d.temperature,
              maxTokens: d.maxTokens,
            },
          });
          this.logger.log(`Seeded default prompt: ${d.promptKey}`);
          continue;
        }

        const needsMaxTokenUpdate =
          FORCE_UPDATE_MAXTOKENS[d.promptKey] &&
          existing.maxTokens < FORCE_UPDATE_MAXTOKENS[d.promptKey];

        const needsMarkerUpdate =
          FORCE_UPDATE_MARKER[d.promptKey] &&
          !String(existing.promptText || '').includes(FORCE_UPDATE_MARKER[d.promptKey]);

        if (needsMaxTokenUpdate || needsMarkerUpdate) {
          await (this.prisma as any).systemPrompt.update({
            where: { promptKey: d.promptKey },
            data: {
              promptText: d.promptText,
              temperature: d.temperature,
              maxTokens: d.maxTokens,
              updatedBy: 'system:auto-migrate',
            },
          });
          this.cache.delete(d.promptKey);
          const reason = needsMarkerUpdate ? `missing marker "${FORCE_UPDATE_MARKER[d.promptKey]}"` : `maxTokens ${existing.maxTokens} → ${d.maxTokens}`;
          this.logger.log(`Auto-migrated prompt: ${d.promptKey} (${reason})`);
        }
      }
    } catch (err) {
      this.logger.warn(`SystemPrompt seed skipped (${err.message}) — using hardcoded defaults`);
    }
  }

  /** ดึง prompt จาก DB พร้อม in-memory cache, fallback to DEFAULT_PROMPTS */
  async get(promptKey: string): Promise<PromptDefault> {
    const cached = this.cache.get(promptKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      if (!(this.prisma as any).systemPrompt) throw new Error('model not ready');
      const row = await (this.prisma as any).systemPrompt.findUnique({ where: { promptKey } });
      if (row) {
        const entry: PromptDefault = {
          promptKey: row.promptKey,
          groupName: row.groupName,
          label: row.label,
          description: row.description || '',
          promptText: row.promptText,
          temperature: row.temperature,
          maxTokens: row.maxTokens,
        };
        this.cache.set(promptKey, { value: entry, expiresAt: Date.now() + CACHE_TTL_MS });
        return entry;
      }
    } catch {
      // DB not ready or schema missing — use default silently
    }

    // Fallback to hardcoded default
    const def = DEFAULT_PROMPTS.find((p) => p.promptKey === promptKey);
    return def ?? {
      promptKey,
      groupName: 'Unknown',
      label: promptKey,
      description: '',
      promptText: '',
      temperature: 0.3,
      maxTokens: 1024,
    };
  }

  /** Invalidate cache entry ทันทีหลัง update */
  invalidate(promptKey: string) {
    this.cache.delete(promptKey);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async listAll() {
    try {
      if (!(this.prisma as any).systemPrompt) throw new Error('model not ready');
      const rows = await (this.prisma as any).systemPrompt.findMany({ orderBy: [{ groupName: 'asc' }, { promptKey: 'asc' }] });
      return rows;
    } catch {
      return DEFAULT_PROMPTS.map((d) => ({ ...d, id: 0, isActive: true, updatedBy: null, createdAt: new Date(), updatedAt: new Date() }));
    }
  }

  async update(promptKey: string, data: { promptText?: string; temperature?: number; maxTokens?: number; label?: string; description?: string }, updatedBy?: string) {
    if (!(this.prisma as any).systemPrompt) throw new Error('SystemPrompt table not ready');
    const row = await (this.prisma as any).systemPrompt.upsert({
      where: { promptKey },
      update: { ...data, updatedBy: updatedBy || null },
      create: {
        promptKey,
        groupName: DEFAULT_PROMPTS.find((p) => p.promptKey === promptKey)?.groupName || 'Custom',
        label: data.label || promptKey,
        description: data.description || '',
        promptText: data.promptText || '',
        temperature: data.temperature ?? 0.3,
        maxTokens: data.maxTokens ?? 1024,
        updatedBy: updatedBy || null,
      },
    });
    this.invalidate(promptKey);
    return row;
  }

  async resetToDefault(promptKey: string) {
    if (!(this.prisma as any).systemPrompt) throw new Error('SystemPrompt table not ready');
    const def = DEFAULT_PROMPTS.find((p) => p.promptKey === promptKey);
    if (!def) return null;
    const row = await (this.prisma as any).systemPrompt.update({
      where: { promptKey },
      data: {
        promptText: def.promptText,
        temperature: def.temperature,
        maxTokens: def.maxTokens,
        updatedBy: 'system:reset',
      },
    });
    this.invalidate(promptKey);
    return row;
  }
}
