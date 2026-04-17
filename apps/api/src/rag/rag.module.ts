import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThaiTokenizerService } from './services/thai-tokenizer.service';
import { ThaiStructureParserService } from './services/thai-structure-parser.service';
import { QueryRewriterService } from './services/query-rewriter.service';
import { RerankerService } from './services/reranker.service';
import { QueryCacheService } from './services/query-cache.service';
import { HorizonRagService } from './services/horizon-rag.service';
import { PolicyRagService } from './services/policy-rag.service';
import { RetrievalService } from './services/retrieval.service';
import { ReasoningService } from './services/reasoning.service';
import { EmbeddingService } from './services/embedding.service';
import { VectorStoreService } from './services/vector-store.service';
import { ChunkingService } from './services/chunking.service';
import { HybridSearchService } from './services/hybrid-search.service';
import { PolicyAlignmentService } from './services/policy-alignment.service';
import { QueryCacheScheduler } from './schedulers/query-cache.scheduler';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [GeminiModule, ScheduleModule.forRoot()],
  providers: [
    ThaiTokenizerService,
    ThaiStructureParserService,
    HorizonRagService,
    PolicyRagService,
    EmbeddingService,
    VectorStoreService,
    ChunkingService,
    HybridSearchService,
    RetrievalService,
    ReasoningService,
    PolicyAlignmentService,
    QueryRewriterService,
    RerankerService,
    QueryCacheService,
    QueryCacheScheduler,
  ],
  exports: [
    ThaiTokenizerService,
    ThaiStructureParserService,
    HorizonRagService,
    PolicyRagService,
    EmbeddingService,
    VectorStoreService,
    ChunkingService,
    HybridSearchService,
    RetrievalService,
    ReasoningService,
    PolicyAlignmentService,
    QueryRewriterService,
    RerankerService,
    QueryCacheService,
  ],
})
export class RagModule {}
