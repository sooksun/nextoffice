import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingService } from './embedding.service';

export const COLLECTION_KNOWLEDGE = 'knowledge';
export const COLLECTION_DOCUMENTS = 'documents';

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, any>;
}

@Injectable()
export class VectorStoreService implements OnModuleInit {
  private readonly logger = new Logger(VectorStoreService.name);
  private client: QdrantClient;

  constructor(
    private readonly config: ConfigService,
    private readonly embedding: EmbeddingService,
  ) {}

  async onModuleInit() {
    const host = this.config.get<string>('QDRANT_HOST', 'localhost');
    const port = this.config.get<number>('QDRANT_PORT', 6333);
    this.client = new QdrantClient({ host, port });
    // Retry for up to 60s to allow Qdrant to start
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await this.ensureCollections();
        this.logger.log('Qdrant connected and collections ready');
        return;
      } catch (err) {
        this.logger.warn(`Qdrant not ready (attempt ${attempt}/6): ${err.message}`);
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
    this.logger.error('Qdrant unavailable after 60s — vector search disabled');
  }

  private async ensureCollections() {
    const collections = [COLLECTION_KNOWLEDGE, COLLECTION_DOCUMENTS];
    for (const name of collections) {
      try {
        await this.client.getCollection(name);
      } catch {
        await this.client.createCollection(name, {
          vectors: { size: this.embedding.dimension, distance: 'Cosine' },
        });
        this.logger.log(`Created Qdrant collection: ${name}`);
      }
    }
  }

  async upsert(collection: string, pointId: string, vector: number[], payload: Record<string, any>) {
    if (!this.client) {
      throw new Error('Qdrant client not initialized — vector storage unavailable');
    }
    await this.client.upsert(collection, {
      points: [{ id: pointId, vector, payload }],
    });
  }

  /** Delete all Qdrant points belonging to a knowledge item (used before re-embed to avoid duplication). */
  async deleteByItemId(itemId: bigint): Promise<void> {
    if (!this.client) return;
    await this.client.delete(COLLECTION_KNOWLEDGE, {
      filter: { must: [{ key: 'itemId', match: { value: itemId.toString() } }] },
    });
  }

  async search(
    collection: string,
    queryVector: number[],
    limit = 10,
    filter?: Record<string, any>,
  ): Promise<VectorSearchResult[]> {
    if (!this.client) return [];
    try {
      const results = await this.client.search(collection, {
        vector: queryVector,
        limit,
        with_payload: true,
        filter,
      });
      return results.map((r) => ({
        id: String(r.id),
        score: r.score,
        payload: (r.payload as Record<string, any>) ?? {},
      }));
    } catch (err) {
      this.logger.warn(`Qdrant search failed: ${err.message}`);
      return [];
    }
  }

  async searchByText(
    collection: string,
    text: string,
    limit = 10,
    filter?: Record<string, any>,
  ): Promise<VectorSearchResult[]> {
    const vector = await this.embedding.embed(text);
    if (!vector.length) return [];
    return this.search(collection, vector, limit, filter);
  }

  async delete(collection: string, pointId: string) {
    await this.client.delete(collection, { points: [pointId] });
  }

  async deleteByFilter(collection: string, filter: Record<string, any>) {
    await this.client.delete(collection, { filter });
  }
}
