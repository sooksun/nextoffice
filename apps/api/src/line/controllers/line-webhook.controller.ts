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
import { LineMessagingService } from '../services/line-messaging.service';
import { LineInquiryService } from '../services/line-inquiry.service';
import { LineAttendanceService } from '../services/line-attendance.service';
import { IntentClassifierService } from '../../ai/services/intent-classifier.service';
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
    private readonly messagingSvc: LineMessagingService,
    private readonly inquirySvc: LineInquiryService,
    private readonly attendanceSvc: LineAttendanceService,
    private readonly intentSvc: IntentClassifierService,
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
            const holdMatch = text.match(/^รอพิจารณา\s*#(\d+)$/);
            const createCaseMatch = /^สร้างเรื่อง/.test(text);

            // V2: Inquiry commands — saraban, case detail, search, dashboard
            const sarabanInboundMatch = /^ทะเบียนรับ$/.test(text);
            const sarabanInboundUrgentMatch = /^ทะเบียนรับด่วน$/.test(text);
            const sarabanInboundPendingMatch = /^ทะเบียนรับรอดำเนินการ$/.test(text);
            const sarabanInboundTodayMatch = /^ทะเบียนรับวันนี้$/.test(text);
            const sarabanOutboundMatch = /^ทะเบียนส่ง$/.test(text);
            const caseDetailMatch = text.match(/^ดูเรื่อง\s*#(\d+)$/);
            const searchMatch = text.match(/^ค้นหา\s+(.+)$/);
            const dashboardMatch = /^(ภาพรวม|แดชบอร์ด|สรุปวันนี้)$/.test(text);
            const overdueMatch = /^(งานเกินกำหนด|งานค้าง|เกินกำหนด)$/.test(text);
            const mainMenuMatch = /^(เมนู|menu)$/i.test(text);

            // V3: Attendance & Leave commands
            const relinkMatch = /^เปลี่ยน\s*(user|ยูสเซอร์|ผู้ใช้)$/i.test(text);
            const checkInMatch = /^(ลงเวลา|เช็คอิน)$/.test(text);
            const attendanceStatusMatch = /^(สถานะลงเวลา|เวลาวันนี้)$/.test(text);
            const leaveStatusMatch = /^(สถานะการลา|ลาเหลือ|วันลา)$/.test(text);
            const leavePromptMatch = /^(ขอลา|ส่งใบลา)$/.test(text);
            const travelPromptMatch = /^(ขอไปราชการ|ไปราชการ)$/.test(text);

            if (relinkMatch && uid && rt) {
              await this.pairingSvc.handleRelink(uid, rt);
            } else if (pairingMatch && uid) {
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
            } else if (holdMatch && rt) {
              await this.messagingSvc.reply(rt, [
                { type: 'text', text: `รับทราบครับ เรื่อง #${holdMatch[1]} จะรอพิจารณาก่อน\nสามารถลงรับได้ภายหลังโดยพิมพ์ "ลงรับ #${holdMatch[1]}"` },
              ]);
            } else if (createCaseMatch && rt) {
              await this.messagingSvc.reply(rt, [
                this.messagingSvc.buildQuickReply('เลือกประเภทเรื่องที่ต้องการสร้าง:', [
                  { label: 'บันทึกเสนอ', text: 'สร้างบันทึกเสนอ' },
                  { label: 'หนังสือตอบ', text: 'ร่างข้อความตอบ' },
                  { label: 'รายงานผล', text: 'สร้างรายงาน' },
                ]),
              ]);
            // V2: Inquiry commands
            } else if (sarabanInboundMatch && uid && rt) {
              await this.inquirySvc.handleSarabanInbound(uid, rt);
            } else if (sarabanInboundUrgentMatch && uid && rt) {
              await this.inquirySvc.handleSarabanInbound(uid, rt, 'urgent');
            } else if (sarabanInboundPendingMatch && uid && rt) {
              await this.inquirySvc.handleSarabanInbound(uid, rt, 'pending');
            } else if (sarabanInboundTodayMatch && uid && rt) {
              await this.inquirySvc.handleSarabanInbound(uid, rt, 'today');
            } else if (sarabanOutboundMatch && uid && rt) {
              await this.inquirySvc.handleSarabanOutbound(uid, rt);
            } else if (caseDetailMatch && uid && rt) {
              await this.inquirySvc.handleCaseDetail(uid, Number(caseDetailMatch[1]), rt);
            } else if (searchMatch && uid && rt) {
              await this.inquirySvc.handleSearchCases(uid, searchMatch[1].trim(), rt);
            } else if (dashboardMatch && uid && rt) {
              await this.inquirySvc.handleDashboard(uid, rt);
            } else if (overdueMatch && uid && rt) {
              await this.inquirySvc.handleOverdue(uid, rt);
            } else if (mainMenuMatch && rt) {
              await this.inquirySvc.handleMainMenu(rt);
            // V3: Attendance & Leave
            } else if (checkInMatch && uid && rt) {
              await this.attendanceSvc.handleCheckInPrompt(uid, rt);
            } else if (attendanceStatusMatch && uid && rt) {
              await this.attendanceSvc.handleAttendanceStatus(uid, rt);
            } else if (leaveStatusMatch && uid && rt) {
              await this.attendanceSvc.handleLeaveStatus(uid, rt);
            } else if (leavePromptMatch && uid && rt) {
              await this.attendanceSvc.handleLeavePrompt(uid, rt);
            } else if (travelPromptMatch && uid && rt) {
              await this.attendanceSvc.handleTravelPrompt(uid, rt);
            } else {
              // V2: Try NLU intent classification before RAG fallback
              let handledByNlu = false;
              try {
                const intent = await this.intentSvc.classify(text);
                if (intent.confidence >= 0.8 && intent.intent !== 'unknown') {
                  this.logger.log(`NLU classified "${text}" as ${intent.intent} (${intent.confidence})`);
                  handledByNlu = await this.handleNluIntent(uid, rt, intent, eventId);
                }
              } catch (nluErr) {
                this.logger.warn(`NLU classification failed (falling back to RAG): ${nluErr.message}`);
              }

              if (!handledByNlu) {
                // Text messages are QuickReply actions or freeform queries → RAG pipeline
                await this.dispatcher.dispatchLineMenuAction(eventId);
              }
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
            // Immediately acknowledge receipt so user knows we're processing
            if (rt) {
              await this.messagingSvc.reply(rt, [
                { type: 'text', text: 'ได้รับไฟล์แล้วครับ กรุณารอสักครู่ ระบบกำลังประมวลผล...' },
              ]);
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

  /**
   * V2: Handle NLU-classified intents from LINE text messages.
   * Returns true if the intent was handled, false to fall back to RAG pipeline.
   */
  private async handleNluIntent(
    uid: string | undefined,
    rt: string | undefined,
    intent: { intent: string; entities: Record<string, any>; confidence: number },
    eventId: bigint,
  ): Promise<boolean> {
    if (!uid) return false;

    switch (intent.intent) {
      case 'forward':
        if (intent.entities.targetDepartment) {
          // Forward current document context to target department
          if (rt) {
            await this.messagingSvc.reply(rt, [
              { type: 'text', text: `รับทราบครับ จะส่งเรื่องนี้ไปที่ "${intent.entities.targetDepartment}" ให้` },
            ]);
          }
          // Still dispatch to queue for actual routing logic
          await this.dispatcher.dispatchLineMenuAction(eventId);
          return true;
        }
        return false;

      case 'register':
        // Find the latest active session's case
        if (rt) {
          await this.messagingSvc.reply(rt, [
            { type: 'text', text: 'กำลังลงรับหนังสือให้ครับ...' },
          ]);
        }
        await this.dispatcher.dispatchLineMenuAction(eventId);
        return true;

      case 'daily_summary':
        // Trigger executive snapshot
        if (rt) {
          await this.messagingSvc.reply(rt, [
            { type: 'text', text: 'กำลังสรุปภาพรวมวันนี้ให้ครับ...' },
          ]);
        }
        await this.dispatcher.dispatchLineMenuAction(eventId);
        return true;

      case 'create_memo':
        // Acknowledge and forward to RAG for draft generation
        if (rt) {
          await this.messagingSvc.reply(rt, [
            { type: 'text', text: 'รับทราบครับ กำลังร่างเอกสารให้...' },
          ]);
        }
        await this.dispatcher.dispatchLineMenuAction(eventId);
        return true;

      case 'ask_ai':
      case 'summarize':
      case 'translate':
        // These intents map directly to existing RAG pipeline actions
        return false; // Let RAG pipeline handle

      default:
        return false;
    }
  }
}
