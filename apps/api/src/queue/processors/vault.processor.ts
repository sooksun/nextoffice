import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_AI_PROCESSING } from '../queue.constants';
import { NoteGeneratorService } from '../../vault/services/note-generator.service';
import { VaultSyncService } from '../../vault/services/vault-sync.service';
import { KnowledgeGraphService } from '../../vault/services/knowledge-graph.service';
import { PrismaService } from '../../prisma/prisma.service';

@Processor(QUEUE_AI_PROCESSING)
export class VaultProcessor {
  private readonly logger = new Logger(VaultProcessor.name);

  constructor(
    private readonly noteGenerator: NoteGeneratorService,
    private readonly vaultSync: VaultSyncService,
    private readonly graphService: KnowledgeGraphService,
    private readonly prisma: PrismaService,
  ) {}

  @Process('vault.note.generate')
  async handleNoteGenerate(job: Job) {
    const { caseId, trigger } = job.data;
    this.logger.log(`Processing vault.note.generate — caseId=${caseId}, trigger=${trigger}`);

    try {
      const note = await this.noteGenerator.generateFromCase(Number(caseId));
      if (note) {
        await this.graphService.autoLink(Number(note.id));
        this.logger.log(`Generated knowledge note #${note.id} for case ${caseId}`);

        // Auto-sync if config allows
        if (note.organizationId) {
          const config = await this.prisma.knowledgeVaultConfig.findUnique({
            where: { organizationId: note.organizationId },
          });
          if (config?.syncEnabled) {
            await this.vaultSync.syncNote(Number(note.id));
            this.logger.log(`Auto-synced note #${note.id} to vault`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`vault.note.generate failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Process('vault.sync.batch')
  async handleSyncBatch(job: Job) {
    const { organizationId } = job.data;
    this.logger.log(`Processing vault.sync.batch — organizationId=${organizationId}`);

    try {
      const result = await this.vaultSync.syncAll(Number(organizationId));
      this.logger.log(`Synced ${result} notes for org ${organizationId}`);
    } catch (error) {
      this.logger.error(`vault.sync.batch failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
