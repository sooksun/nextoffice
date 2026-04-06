import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { HorizonSourceService } from './services/horizon-source.service';
import { HorizonFetchService } from './services/horizon-fetch.service';
import { HorizonNormalizeService } from './services/horizon-normalize.service';
import { HorizonClassifyService } from './services/horizon-classify.service';
import { HorizonSignalService } from './services/horizon-signal.service';
import { HorizonEmbedService } from './services/horizon-embed.service';
import { HorizonPipelineService } from './services/horizon-pipeline.service';
import { HorizonSourcesController } from './controllers/horizon-sources.controller';
import { HorizonIntelligenceController } from './controllers/horizon-intelligence.controller';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [HorizonSourcesController, HorizonIntelligenceController],
  providers: [
    HorizonSourceService,
    HorizonFetchService,
    HorizonNormalizeService,
    HorizonClassifyService,
    HorizonSignalService,
    HorizonEmbedService,
    HorizonPipelineService,
  ],
  exports: [
    HorizonSourceService,
    HorizonFetchService,
    HorizonNormalizeService,
    HorizonClassifyService,
    HorizonSignalService,
    HorizonEmbedService,
    HorizonPipelineService,
  ],
})
export class HorizonModule {}
