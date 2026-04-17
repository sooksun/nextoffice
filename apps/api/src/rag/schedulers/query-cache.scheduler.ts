import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueryCacheService } from '../services/query-cache.service';

/**
 * Background maintenance for the chat answer cache.
 *
 * Lazy-delete (in QueryCacheService.lookup) already drops expired rows
 * the moment they're touched — but rows that stop being queried would
 * otherwise grow forever. This cron sweeps them up once a day.
 */
@Injectable()
export class QueryCacheScheduler {
  private readonly logger = new Logger(QueryCacheScheduler.name);

  constructor(private readonly cache: QueryCacheService) {}

  /** 03:00 every day — low-traffic window to keep the table tidy. */
  @Cron('0 0 3 * * *')
  async cleanupExpired() {
    try {
      const count = await this.cache.cleanupExpired();
      this.logger.log(`Cron: cache cleanup swept — pruned ${count} expired entries`);
    } catch (err: any) {
      this.logger.warn(`Cron: cache cleanup failed: ${err?.message ?? err}`);
    }
  }
}
