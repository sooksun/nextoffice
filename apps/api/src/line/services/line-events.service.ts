import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LineEventsService {
  private readonly logger = new Logger(LineEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async saveEvent(event: any, rawPayload: string): Promise<bigint | null> {
    try {
      // Get or create the default channel
      const channel = await this.getOrCreateChannel();

      // Upsert to handle redelivery — use webhookEventId as idempotency key
      const webhookEventId = event.webhookEventId || event.id || `${Date.now()}-${Math.random()}`;

      const existing = await this.prisma.lineEvent.findUnique({
        where: { webhookEventId },
      });
      if (existing) {
        this.logger.warn(`Duplicate event received: ${webhookEventId}`);
        return existing.id;
      }

      const saved = await this.prisma.lineEvent.create({
        data: {
          lineChannelId: channel.id,
          webhookEventId,
          lineUserId: event.source?.userId || 'unknown',
          eventType: event.type,
          messageId: event.message?.id || null,
          messageType: event.message?.type || null,
          replyToken: event.replyToken || null,
          rawPayloadJson: rawPayload,
          isRedelivery: event.deliveryContext?.isRedelivery || false,
          receiveStatus: 'received',
        },
      });

      return saved.id;
    } catch (err) {
      this.logger.error(`Failed to save LINE event: ${err.message}`);
      return null;
    }
  }

  async markProcessed(eventId: bigint) {
    await this.prisma.lineEvent.update({
      where: { id: eventId },
      data: { receiveStatus: 'processed', processedAt: new Date() },
    });
  }

  private async getOrCreateChannel() {
    const channelId = this.config.get<string>('LINE_CHANNEL_ID') || 'default';
    let channel = await this.prisma.lineChannel.findFirst({
      where: { lineChannelId: channelId },
    });
    if (!channel) {
      channel = await this.prisma.lineChannel.create({
        data: {
          channelName: 'Default Channel',
          lineChannelId: channelId,
          lineChannelSecret: this.config.get('LINE_CHANNEL_SECRET') || '',
          lineChannelAccessToken: this.config.get('LINE_CHANNEL_ACCESS_TOKEN') || '',
          isActive: true,
        },
      });
    }
    return channel;
  }
}
