import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type FeedbackRating = 'up' | 'down';

export interface SubmitFeedbackInput {
  queryId: string;
  userId?: number | bigint | null;
  rating: FeedbackRating;
  comment?: string;
  userQuery?: string;
  assistantAnswer?: string;
  pageRoute?: string;
  pageEntityId?: number | bigint | null;
}

/**
 * Collects 👍/👎 signals from users on assistant answers.
 * Idempotent per queryId — submitting twice updates the last rating.
 */
@Injectable()
export class ChatFeedbackService {
  private readonly logger = new Logger(ChatFeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submit(input: SubmitFeedbackInput): Promise<{ ok: true }> {
    const data = {
      queryId: input.queryId,
      userId: input.userId != null ? BigInt(input.userId) : null,
      rating: input.rating,
      comment: input.comment?.slice(0, 4000) ?? null,
      userQuery: input.userQuery?.slice(0, 2000) ?? null,
      assistantAnswer: input.assistantAnswer ?? null,
      pageRoute: input.pageRoute?.slice(0, 255) ?? null,
      pageEntityId: input.pageEntityId != null ? BigInt(input.pageEntityId) : null,
    };

    try {
      await this.prisma.chatFeedback.upsert({
        where: { queryId: input.queryId },
        create: data,
        update: {
          rating: data.rating,
          comment: data.comment,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Feedback submit failed: ${err?.message ?? err}`);
      throw err;
    }
    return { ok: true };
  }

  /** Simple stats view for an admin dashboard. */
  async stats(rangeDays = 30) {
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const [up, down] = await Promise.all([
      this.prisma.chatFeedback.count({ where: { rating: 'up', createdAt: { gte: since } } }),
      this.prisma.chatFeedback.count({ where: { rating: 'down', createdAt: { gte: since } } }),
    ]);
    const total = up + down;
    return {
      rangeDays,
      up,
      down,
      total,
      satisfactionRate: total > 0 ? up / total : 0,
    };
  }

  /**
   * Top 👎 queries — candidates for expanding the knowledge base.
   * Groups by user_query so recurring bad-answer patterns surface.
   */
  async topNegativeQueries(rangeDays = 30, limit = 20) {
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const rows: Array<{ user_query: string | null; page_route: string | null; c: bigint }> =
      await this.prisma.$queryRawUnsafe(
        `SELECT user_query, page_route, COUNT(*) AS c
         FROM chat_feedback
         WHERE rating = 'down' AND created_at >= ? AND user_query IS NOT NULL
         GROUP BY user_query, page_route
         ORDER BY c DESC
         LIMIT ?`,
        since,
        limit,
      );
    return rows.map((r) => ({
      userQuery: r.user_query,
      pageRoute: r.page_route,
      downCount: Number(r.c),
    }));
  }

  /**
   * Satisfaction rate broken down per page route.
   * Only returns pages with >= 3 feedback events (min sample size).
   */
  async statsByPage(rangeDays = 30, minSamples = 3) {
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const rows: Array<{ page_route: string | null; up: bigint; down: bigint }> =
      await this.prisma.$queryRawUnsafe(
        `SELECT page_route,
                SUM(CASE WHEN rating = 'up'   THEN 1 ELSE 0 END) AS up,
                SUM(CASE WHEN rating = 'down' THEN 1 ELSE 0 END) AS down
         FROM chat_feedback
         WHERE created_at >= ?
         GROUP BY page_route
         HAVING (up + down) >= ?
         ORDER BY (up + down) DESC`,
        since,
        minSamples,
      );
    return rows.map((r) => {
      const up = Number(r.up);
      const down = Number(r.down);
      const total = up + down;
      return {
        pageRoute: r.page_route ?? '(no context)',
        up,
        down,
        total,
        satisfactionRate: total > 0 ? up / total : 0,
      };
    });
  }

  /** Recent feedback entries — useful for the admin to inspect. */
  async recent(limit = 30) {
    const rows = await this.prisma.chatFeedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        queryId: true,
        rating: true,
        userQuery: true,
        assistantAnswer: true,
        pageRoute: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: Number(r.id),
      queryId: r.queryId,
      rating: r.rating as 'up' | 'down',
      userQuery: r.userQuery,
      // truncate long answers for list view
      answerPreview: r.assistantAnswer ? r.assistantAnswer.slice(0, 300) : null,
      pageRoute: r.pageRoute,
      createdAt: r.createdAt,
    }));
  }
}
