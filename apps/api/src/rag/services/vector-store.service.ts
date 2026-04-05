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
    await this.ensureCollections();
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
    await this.client.upsert(collection, {
      points: [{ id: pointId, vector, payload }],
    });
  }

  async search(
    collection: string,
    queryVector: number[],
    limit = 10,
    filter?: Record<string, any>,
  ): Promise<VectorSearchResult[]> {
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
