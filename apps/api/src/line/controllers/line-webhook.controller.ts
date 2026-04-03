import {
  Controller,
  Post,
  Headers,
  Body,
  RawBodyRequest,
  Req,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { LineSignatureService } from '../services/line-signature.service';
import { LineEventsService } from '../services/line-events.service';
import { LineUsersService } from '../services/line-users.service';
import { QueueDispatcherService } from '../../queue/services/queue-dispatcher.service';

@ApiTags('line')
@Controller('line')
export class LineWebhookController {
  private readonly logger = new Logger(LineWebhookController.name);

  constructor(
    private readonly signatureSvc: LineSignatureService,
    private readonly eventsSvc: LineEventsService,
    private readonly usersSvc: LineUsersService,
    private readonly dispatcher: QueueDispatcherService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'LINE webhook endpoint - receives events from LINE platform' })
  async handleWebhook(
    @Headers('x-line-signature') signature: string,
    @Body() body: any,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody || JSON.stringify(body);

    // Validate LINE signature
    try {
      this.signatureSvc.validateOrThrow(signature, rawBody);
    } catch {
      this.logger.warn('Invalid LINE signature received — ignoring');
      return { ok: true }; // Always return 200 to LINE
    }

    const events: any[] = body.events || [];
    this.logger.log(`Received ${events.length} LINE event(s)`);

    for (const event of events) {
      try {
        const rawStr = JSON.stringify(event);

        // Save event with idempotency
        const eventId = await this.eventsSvc.saveEvent(event, rawStr);
        if (!eventId) continue;

        // Upsert LINE user
        const channel = await this.usersSvc.getDefaultChannel();
        if (channel && event.source?.userId) {
          await this.usersSvc.upsert(
            event.source.userId,
            channel.id,
            event.source?.displayName,
          );
        }

        // Dispatch job to queue based on event type
        if (event.type === 'message' && event.message) {
          if (event.message.type === 'text') {
            // Text messages are QuickReply actions or freeform queries → RAG pipeline
            await this.dispatcher.dispatchLineMenuAction(eventId);
          } else {
            // Image / file messages → document intake pipeline
            await this.dispatcher.dispatchLineIntake(eventId);
          }
        }
      } catch (err) {
        this.logger.error(`Error processing event: ${err.message}`);
      }
    }

    return { ok: true };
  }
}
