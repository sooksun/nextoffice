import { Injectable, Logger } from '@nestjs/common';
import { HorizonFetchService } from './horizon-fetch.service';
import { HorizonNormalizeService } from './horizon-normalize.service';
import { HorizonClassifyService } from './horizon-classify.service';
import { HorizonSignalService } from './horizon-signal.service';
import { HorizonEmbedService } from './horizon-embed.service';
import { HorizonSourceService } from './horizon-source.service';

@Injectable()
export class HorizonPipelineService {
  private readonly logger = new Logger(HorizonPipelineService.name);

  constructor(
    private readonly sourceService: HorizonSourceService,
    private readonly fetchService: HorizonFetchService,
    private readonly normalizeService: HorizonNormalizeService,
    private readonly classifyService: HorizonClassifyService,
    private readonly signalService: HorizonSignalService,
    private readonly embedService: HorizonEmbedService,
  ) {}

  async runForSource(sourceId: number) {
    this.logger.log(`Running pipeline for source #${sourceId}`);

    const fetchResult = await this.fetchService.fetchSource(sourceId);
    if (fetchResult.status === 'duplicate') {
      this.logger.log(`Source #${sourceId}: duplicate content, skipping pipeline`);
      return { sourceId, ...fetchResult, pipeline: 'skipped' };
    }

    const docResult = await this.runForDocument(fetchResult.documentId);
    return { sourceId, fetchResult, ...docResult };
  }

  async runForDocument(documentId: number) {
    this.logger.log(`Running pipeline for document #${documentId}`);
    const results: any = { documentId };

    try {
      results.normalize = await this.normalizeService.normalize(documentId);
    } catch (error) {
      this.logger.error(`Normalize failed for doc #${documentId}: ${error.message}`);
      results.normalize = { status: 'error', error: error.message };
      return results;
    }

    try {
      results.classify = await this.classifyService.classify(documentId);
    } catch (error) {
      this.logger.error(`Classify failed for doc #${documentId}: ${error.message}`);
      results.classify = { status: 'error', error: error.message };
    }

    try {
      results.signals = await this.signalService.extractSignals(documentId);
    } catch (error) {
      this.logger.error(`Signal extraction failed for doc #${documentId}: ${error.message}`);
      results.signals = { status: 'error', error: error.message };
    }

    try {
      results.embed = await this.embedService.embedDocument(documentId);
    } catch (error) {
      this.logger.error(`Embedding failed for doc #${documentId}: ${error.message}`);
      results.embed = { status: 'error', error: error.message };
    }

    this.logger.log(`Pipeline complete for document #${documentId}`);
    return results;
  }

  async runAll() {
    this.logger.log('Running full horizon pipeline for all active sources');

    const sources = await this.sourceService.findAll({ isActive: true });
    const results = [];

    for (const source of sources) {
      try {
        const result = await this.runForSource(source.id);
        results.push(result);
      } catch (error) {
        this.logger.error(`Pipeline failed for source #${source.id}: ${error.message}`);
        results.push({
          sourceId: source.id,
          sourceCode: source.sourceCode,
          status: 'error',
          error: error.message,
        });
      }
    }

    return {
      totalSources: sources.length,
      results,
    };
  }
}
