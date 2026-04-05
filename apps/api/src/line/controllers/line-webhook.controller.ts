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
import { LinePairingService } from '../services/line-pairing.service';
import { LineWorkflowService } from '../services/line-workflow.service';
import { QueueDispatcherService } from '../../queue/services/queue-dispatcher.service';

@ApiTags('line')
@Controller('line')
export class LineWebhookController {
  private readonly logger = new Logger(LineWebhookController.name);

  constructor(
    private readonly signatureSvc: LineSignatureService,
    private readonly eventsSvc: LineEventsService,
    private readonly usersSvc: LineUsersService,
    private readonly pairingSvc: LinePairingService,
    private readonly workflowSvc: LineWorkflowService,
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
        const uid = event.source?.userId;
        const rt = event.replyToken;

        if (event.type === 'message' && event.message) {
          if (event.message.type === 'text') {
            const text = (event.message.text || '').trim();

            // Auto-pairing: unlinked LINE users get prompted for email
            if (uid && rt) {
              const handled = await this.pairingSvc.handleAutoLink(uid, text, rt);
              if (handled) continue;
            }

            // Intercept system commands before dispatching to queue
            const pairingMatch = text.match(/^ผูกบัญชี\s*(\d{6})$/);
            const pairingHelpMatch = /^ผูกบัญชี/.test(text) && !pairingMatch;
            const registerMatch = text.match(/^ลงรับ\s*#(\d+)$/);
            const assignShowMatch = text.match(/^มอบหมาย\s*#(\d+)$/);
            const assignToMatch = text.match(/^มอบหมายให้\s*#(\d+)\s*@(\d+)$/);
            const acceptMatch = text.match(/^รับทราบ\s*#(\d+)$/);
            const completeMatch = text.match(/^เสร็จแล้ว\s*#(\d+)$/);
            const myTasksMatch = /^(งานของฉัน|สถานะงาน)$/.test(text);

            if (pairingMatch && uid) {
              await this.pairingSvc.handlePairingMessage(uid, pairingMatch[1], rt);
            } else if (pairingHelpMatch && uid) {
              await this.pairingSvc.handlePairingHelp(rt);
            } else if (registerMatch && uid) {
              await this.workflowSvc.handleRegister(uid, Number(registerMatch[1]), rt);
            } else if (assignToMatch && uid) {
              await this.workflowSvc.handleAssignTo(uid, Number(assignToMatch[1]), Number(assignToMatch[2]), rt);
            } else if (assignShowMatch && uid) {
              await this.workflowSvc.handleShowStaffList(uid, Number(assignShowMatch[1]), rt);
            } else if (acceptMatch && uid) {
              await this.workflowSvc.handleAcceptAssignment(uid, Number(acceptMatch[1]), rt);
            } else if (completeMatch && uid) {
              await this.workflowSvc.handleCompleteAssignment(uid, Number(completeMatch[1]), rt);
            } else if (myTasksMatch && uid) {
              await this.workflowSvc.handleMyTasks(uid, rt);
            } else {
              // Text messages are QuickReply actions or freeform queries → RAG pipeline
              await this.dispatcher.dispatchLineMenuAction(eventId);
            }
          } else {
            // Image / file messages → document intake pipeline
            // Block intake for unlinked users
            if (uid) {
              const linkedUser = await this.pairingSvc.getLinkedUser(uid);
              if (!linkedUser) {
                await this.pairingSvc.handleAutoLink(uid, '', rt);
                continue;
              }
            }
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
