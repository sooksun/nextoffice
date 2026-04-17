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
}
