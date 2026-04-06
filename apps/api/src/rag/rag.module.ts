import { Module } from '@nestjs/common';
import { ThaiTokenizerService } from './services/thai-tokenizer.service';
import { HorizonRagService } from './services/horizon-rag.service';
import { PolicyRagService } from './services/policy-rag.service';
import { RetrievalService } from './services/retrieval.service';
import { ReasoningService } from './services/reasoning.service';
import { EmbeddingService } from './services/embedding.service';
import { VectorStoreService } from './services/vector-store.service';
import { ChunkingService } from './services/chunking.service';
import { HybridSearchService } from './services/hybrid-search.service';
import { PolicyAlignmentService } from './services/policy-alignment.service';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [GeminiModule],
  providers: [
    ThaiTokenizerService,
    HorizonRagService,
    PolicyRagService,
    EmbeddingService,
    VectorStoreService,
    ChunkingService,
    HybridSearchService,
    RetrievalService,
    ReasoningService,
    PolicyAlignmentService,
  ],
  exports: [
    ThaiTokenizerService,
    HorizonRagService,
    PolicyRagService,
    EmbeddingService,
    VectorStoreService,
    ChunkingService,
    HybridSearchService,
    RetrievalService,
    ReasoningService,
    PolicyAlignmentService,
  ],
})
export class RagModule {}
