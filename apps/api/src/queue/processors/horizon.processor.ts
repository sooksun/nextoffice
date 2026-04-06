import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_HORIZON } from '../queue.constants';
import { HorizonFetchService } from '../../horizon/services/horizon-fetch.service';
import { HorizonNormalizeService } from '../../horizon/services/horizon-normalize.service';
import { HorizonClassifyService } from '../../horizon/services/horizon-classify.service';
import { HorizonSignalService } from '../../horizon/services/horizon-signal.service';
import { HorizonEmbedService } from '../../horizon/services/horizon-embed.service';
import { HorizonPipelineService } from '../../horizon/services/horizon-pipeline.service';
import { PrismaService } from '../../prisma/prisma.service';

@Processor(QUEUE_HORIZON)
export class HorizonProcessor {
  private readonly logger = new Logger(HorizonProcessor.name);

  constructor(
    private readonly fetchService: HorizonFetchService,
    private readonly normalizeService: HorizonNormalizeService,
    private readonly classifyService: HorizonClassifyService,
    private readonly signalService: HorizonSignalService,
    private readonly embedService: HorizonEmbedService,
    private readonly pipelineService: HorizonPipelineService,
    private readonly prisma: PrismaService,
  ) {}

  @Process('horizon.fetch.sources')
  async handleFetchSources(job: Job) {
    const { sourceId, all, fullPipeline } = job.data;
    this.logger.log(`Processing horizon.fetch.sources — sourceId=${sourceId}, all=${all}`);

    try {
      if (all) {
        const sources = await this.prisma.horizonSource.findMany({
          where: { isActive: true },
        });

        for (const source of sources) {
          const result = await this.fetchService.fetchSource(Number(source.id));
          const docs = Array.isArray(result) ? result : [result];
          this.logger.log(`Fetched ${docs.length} documents from source ${source.sourceCode}`);

          if (fullPipeline) {
            for (const doc of docs) {
              if (doc && doc.id) {
                await this.runDocumentPipeline(Number(doc.id));
              }
            }
          }
        }
      } else if (sourceId) {
        const result = await this.fetchService.fetchSource(Number(sourceId));
        const docs = Array.isArray(result) ? result : [result];
        this.logger.log(`Fetched ${docs.length} documents from source ${sourceId}`);

        if (fullPipeline) {
          for (const doc of docs) {
            if (doc && doc.id) {
              await this.runDocumentPipeline(Number(doc.id));
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`horizon.fetch.sources failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Process('horizon.parse.documents')
  async handleParseDocuments(job: Job) {
    const { documentId } = job.data;
    this.logger.log(`Processing horizon.parse.documents — documentId=${documentId}`);

    try {
      await this.normalizeService.normalize(Number(documentId));
      this.logger.log(`Normalized document ${documentId}`);
    } catch (error) {
      this.logger.error(`horizon.parse.documents failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Process('horizon.extract.intelligence')
  async handleExtractIntelligence(job: Job) {
    const { documentId } = job.data;
    this.logger.log(`Processing horizon.extract.intelligence — documentId=${documentId}`);

    try {
      await this.classifyService.classify(Number(documentId));
      await this.signalService.extractSignals(Number(documentId));
      this.logger.log(`Extracted intelligence for document ${documentId}`);
    } catch (error) {
      this.logger.error(`horizon.extract.intelligence failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Process('horizon.score.agendas')
  async handleScoreAgendas(job: Job) {
    const { agendaId } = job.data;
    this.logger.log(`Processing horizon.score.agendas — agendaId=${agendaId}`);

    try {
      const where = agendaId ? { id: BigInt(agendaId) } : {};
      const agendas = await this.prisma.horizonAgenda.findMany({
        where,
        include: { documents: { include: { document: true } } },
      });

      const now = new Date();
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      for (const agenda of agendas) {
        const allDocs = agenda.documents.map((da) => da.document);
        const recent14 = allDocs.filter((d) => d.fetchedAt >= fourteenDaysAgo).length;
        const recent60 = allDocs.filter((d) => d.fetchedAt >= sixtyDaysAgo).length;

        const momentum = recent60 > 0 ? recent14 / (recent60 / 4.28) : 0;
        const frequency = Math.min(allDocs.length / 10, 1);
        const recency = recent14 > 0 ? 1.0 : recent60 > 0 ? 0.5 : 0.2;

        const priorityScore = recency * 0.3 + frequency * 0.25 + momentum * 0.25 + 0.2;

        await this.prisma.horizonAgenda.update({
          where: { id: agenda.id },
          data: {
            priorityScore,
            momentumScore: Math.min(momentum, 1),
            currentStatus:
              momentum > 0.8 ? 'peak' : momentum > 0.4 ? 'active' : momentum > 0.1 ? 'emerging' : 'fading',
          },
        });
      }

      this.logger.log(`Scored ${agendas.length} agendas`);
    } catch (error) {
      this.logger.error(`horizon.score.agendas failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Process('horizon.publish.rag')
  async handlePublishRag(job: Job) {
    const { documentId } = job.data;
    this.logger.log(`Processing horizon.publish.rag — documentId=${documentId}`);

    try {
      await this.embedService.embedDocument(Number(documentId));
      this.logger.log(`Published document ${documentId} to RAG`);
    } catch (error) {
      this.logger.error(`horizon.publish.rag failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async runDocumentPipeline(documentId: number) {
    try {
      await this.normalizeService.normalize(documentId);
      await this.classifyService.classify(documentId);
      await this.signalService.extractSignals(documentId);
      await this.embedService.embedDocument(documentId);
    } catch (error) {
      this.logger.error(`Pipeline failed for document ${documentId}: ${error.message}`);
    }
  }
}
