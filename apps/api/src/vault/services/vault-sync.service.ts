import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class VaultSyncService {
  private readonly logger = new Logger(VaultSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncNote(noteId: number) {
    const note = await this.prisma.knowledgeNote.findUnique({
      where: { id: BigInt(noteId) },
    });
    if (!note) throw new NotFoundException(`Note #${noteId} not found`);

    const config = note.organizationId
      ? await this.prisma.knowledgeVaultConfig.findUnique({
          where: { organizationId: note.organizationId },
        })
      : null;

    if (!config || !config.syncEnabled) {
      this.logger.warn(`Sync skipped for note #${noteId}: no config or sync disabled`);
      return { synced: false, reason: 'sync_disabled' };
    }

    const filename = this.buildFilename(note);
    const folderPath = note.folderPath || '99_Unsorted/';
    const fullDir = path.join(config.vaultPath, folderPath);
    const fullPath = path.join(fullDir, filename);

    await fs.mkdir(fullDir, { recursive: true });

    const content = this.buildMarkdownFile(note);
    await fs.writeFile(fullPath, content, 'utf-8');

    await this.prisma.knowledgeNote.update({
      where: { id: BigInt(noteId) },
      data: { syncedAt: new Date() },
    });

    this.logger.log(`Synced note #${noteId} to ${fullPath}`);
    return { synced: true, path: fullPath };
  }

  async syncAll(organizationId: number) {
    const config = await this.prisma.knowledgeVaultConfig.findUnique({
      where: { organizationId: BigInt(organizationId) },
    });
    if (!config || !config.syncEnabled) {
      return { synced: 0, reason: 'sync_disabled' };
    }

    const notes = await this.prisma.knowledgeNote.findMany({
      where: {
        organizationId: BigInt(organizationId),
        status: 'published',
      },
    });

    let synced = 0;
    for (const note of notes) {
      try {
        await this.syncNote(Number(note.id));
        synced++;
      } catch (err) {
        this.logger.error(`Failed to sync note #${note.id}: ${err.message}`);
      }
    }

    await this.prisma.knowledgeVaultConfig.update({
      where: { organizationId: BigInt(organizationId) },
      data: { lastSyncAt: new Date() },
    });

    this.logger.log(`Synced ${synced}/${notes.length} notes for org #${organizationId}`);
    return { synced, total: notes.length };
  }

  buildFilename(note: any): string {
    const year = new Date().getFullYear();
    const titleSlug = (note.title || 'untitled')
      .replace(/[^a-zA-Z0-9\u0E00-\u0E7F]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60)
      .replace(/-$/, '');

    const prefixes: Record<string, string> = {
      policy: 'POL',
      letter: 'DOC',
      project: 'PRJ',
      report: 'RPT',
      agenda: 'AGD',
    };

    const prefix = prefixes[note.noteType] || 'NOTE';
    return `${prefix}-${titleSlug}-${year}.md`;
  }

  buildMarkdownFile(note: any): string {
    const parts: string[] = [];

    if (note.frontmatterJson) {
      const fm = typeof note.frontmatterJson === 'string'
        ? JSON.parse(note.frontmatterJson)
        : note.frontmatterJson;

      parts.push('---');
      for (const [key, value] of Object.entries(fm)) {
        if (Array.isArray(value)) {
          parts.push(`${key}:`);
          for (const item of value) {
            parts.push(`  - ${item}`);
          }
        } else if (value !== null && value !== undefined) {
          parts.push(`${key}: ${value}`);
        }
      }
      parts.push('---');
      parts.push('');
    }

    parts.push(note.contentMd || '');
    return parts.join('\n');
  }
}
