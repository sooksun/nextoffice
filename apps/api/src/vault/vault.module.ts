import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NoteGeneratorService } from './services/note-generator.service';
import { VaultSyncService } from './services/vault-sync.service';
import { KnowledgeGraphService } from './services/knowledge-graph.service';
import { VaultController } from './controllers/vault.controller';
import { KnowledgeNotesController } from './controllers/knowledge-notes.controller';

@Module({
  imports: [ConfigModule],
  controllers: [VaultController, KnowledgeNotesController],
  providers: [NoteGeneratorService, VaultSyncService, KnowledgeGraphService],
  exports: [NoteGeneratorService, VaultSyncService, KnowledgeGraphService],
})
export class VaultModule {}
