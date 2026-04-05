import { Module } from '@nestjs/common';
import { ThaiTokenizerService } from './services/thai-tokenizer.service';
import { HorizonRagService } from './services/horizon-rag.service';
import { PolicyRagService } from './services/policy-rag.service';
import { RetrievalService } from './services/retrieval.service';
import { ReasoningService } from './services/reasoning.service';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [GeminiModule],
  providers: [ThaiTokenizerService, HorizonRagService, PolicyRagService, RetrievalService, ReasoningService],
  exports: [ThaiTokenizerService, HorizonRagService, PolicyRagService, RetrievalService, ReasoningService],
})
export class RagModule {}
