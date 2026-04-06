import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { NoteGeneratorService } from './services/note-generator.service';
import { VaultSyncService } from './services/vault-sync.service';
import { KnowledgeGraphService } from './services/knowledge-graph.service';
import { VaultController } from './controllers/vault.controller';
import { KnowledgeNotesController } from './controllers/knowledge-notes.controller';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [VaultController, KnowledgeNotesController],
  providers: [NoteGeneratorService, VaultSyncService, KnowledgeGraphService],
  exports: [NoteGeneratorService, VaultSyncService, KnowledgeGraphService],
})
export class VaultModule {}
