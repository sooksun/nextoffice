import { Module } from '@nestjs/common';
import { HorizonRagService } from './services/horizon-rag.service';
import { PolicyRagService } from './services/policy-rag.service';
import { RetrievalService } from './services/retrieval.service';
import { ReasoningService } from './services/reasoning.service';

@Module({
  providers: [HorizonRagService, PolicyRagService, RetrievalService, ReasoningService],
  exports: [HorizonRagService, PolicyRagService, RetrievalService, ReasoningService],
})
export class RagModule {}
