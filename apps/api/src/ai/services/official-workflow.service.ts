import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExtractionService } from './extraction.service';
import { ReasoningService } from '../../rag/services/reasoning.service';
import { LineMessagingService } from '../../line/services/line-messaging.service';
import { LineSessionService } from '../../line/services/line-session.service';
import { SmartRoutingService } from '../../notifications/smart-routing.service';
import { GoogleCalendarService } from '../../calendar/services/google-calendar.service';

// Map AI urgency text → schema urgencyLevel
function mapUrgency(aiUrgency: string): string {
  if (!aiUrgency) return 'normal';
  const u = aiUrgency.toLowerCase();
  if (u.includes('ที่สุด') || u.includes('very') || u === 'สูงมาก') return 'most_urgent';
  if (u.includes('มาก') || u === 'สูง') return 'very_urgent';
  if (u.includes('ด่วน') || u === 'urgent' || u === 'กลาง') return 'urgent';
  return 'normal';
}

@Injectable()
export class OfficialWorkflowService {
  private readonly logger = new Logger(OfficialWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extraction: ExtractionService,
    private readonly reasoning: ReasoningService,
    private readonly messaging: LineMessagingService,
    private readonly sessions: LineSessionService,
    private readonly smartRouting: SmartRoutingService,
    private readonly calendar: GoogleCalendarService,
  ) {}

  async process(documentIntakeId: bigint): Promise<void> {
    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: documentIntakeId },
      include: { aiResult: true, lineEvent: true },
    });
    if (!intake || !intake.aiResult) return;

    const extractedText = intake.aiResult.extractedText || '';

    // Extract official metadata
    const metadata = await this.extraction.extractOfficialMetadata(extractedText);

    // Update AI result with extracted metadata
    await this.prisma.documentAiResult.update({
      where: { id: intake.aiResult.id },
      data: {
        issuingAuthority: metadata.issuingAuthority,
        documentNo: metadata.documentNo,
        documentDate: metadata.documentDate ? new Date(metadata.documentDate) : null,
        subjectText: metadata.subjectText,
        deadlineDate: metadata.deadlineDate ? new Date(metadata.deadlineDate) : null,
        summaryText: metadata.summary,
        nextActionJson: JSON.stringify(metadata.actions),
        isMeeting: metadata.isMeeting,
        meetingDate: metadata.meetingDate ? new Date(metadata.meetingDate) : null,
        meetingTime: metadata.meetingTime || null,
        meetingLocation: metadata.meetingLocation || null,
      },
    });

    // Ensure organization exists
    const orgId = await this.ensureOrganization(intake.organizationId);

    // Create Document record
    const document = await this.prisma.document.create({
      data: {
        title: metadata.subjectText || 'ไม่ทราบชื่อเรื่อง',
        sourceType: 'line_intake',
        documentType: 'official_letter',
        sourceChannel: intake.sourceChannel,
        issuingAuthority: metadata.issuingAuthority,
        publishedAt: metadata.documentDate ? new Date(metadata.documentDate) : null,
        summaryText: metadata.summary,
        status: 'active',
      },
    });

    // Create InboundCase
    const inboundCase = await this.prisma.inboundCase.create({
      data: {
        organizationId: orgId,
        title: metadata.subjectText || 'กรณีใหม่จากหนังสือราชการ',
        description: metadata.summary,
        sourceDocumentId: document.id,
        dueDate: metadata.deadlineDate ? new Date(metadata.deadlineDate) : null,
        urgencyLevel: mapUrgency(metadata.urgency),
        status: 'analyzing',
      },
    });

    // สร้าง meeting event ถ้าหนังสือมีวันประชุม
    if (metadata.isMeeting && metadata.meetingDate) {
      try {
        const meetingEventId = await this.calendar.createMeetingEvent({
          summary: `[ประชุม] ${metadata.subjectText}`,
          description: `จาก: ${metadata.issuingAuthority}\n\n${metadata.summary}`,
          meetingDate: new Date(metadata.meetingDate),
          meetingTime: metadata.meetingTime || undefined,
          location: metadata.meetingLocation || undefined,
          caseId: Number(inboundCase.id),
        });
        if (meetingEventId) {
          await this.prisma.inboundCase.update({
            where: { id: inboundCase.id },
            data: { meetingCalendarEventId: meetingEventId },
          });
          this.logger.log(`Meeting calendar event created for case #${inboundCase.id}`);
        }
      } catch (calErr) {
        this.logger.warn(`Meeting event creation failed (non-blocking): ${calErr.message}`);
      }
    }

    // Smart routing: auto-suggest & set responsible user
    try {
      const routing = await this.smartRouting.applyRoutingToCase(Number(inboundCase.id));
      if (routing) {
        this.logger.log(`Smart routing applied to case #${inboundCase.id}: ${routing.workGroupCode} (${routing.confidence.toFixed(2)})`);
      }
    } catch (routingErr) {
      this.logger.warn(`Smart routing failed (non-blocking): ${routingErr.message}`);
    }

    // Run RAG Analysis + generate options (non-blocking)
    try {
      await this.reasoning.generateCaseOptions(inboundCase.id, orgId, metadata.subjectText);
    } catch (ragErr) {
      this.logger.warn(`RAG analysis failed (non-blocking): ${ragErr.message}`);
    }

    // Mark intake as completed
    await this.prisma.documentIntake.update({
      where: { id: documentIntakeId },
      data: { aiStatus: 'completed' },
    });

    // Push message to LINE user (reply token expires too fast for async pipeline)
    if (intake.lineEvent) {
      const lineUserId = intake.lineEvent.lineUserId;
      if (lineUserId) {
        const messages = this.messaging.buildOfficialDocumentReply({
          subject: metadata.subjectText,
          issuingAuthority: metadata.issuingAuthority,
          documentNo: metadata.documentNo,
          documentDate: metadata.documentDate,
          deadlineDate: metadata.deadlineDate,
          summary: metadata.summary,
          caseId: Number(inboundCase.id),
        });
        await this.messaging.push(lineUserId, messages);
      }
    }

    // เปิดเซสชันให้ข้อความถัดไป (สรุป/แปล/RAG) โหลด extractedText จาก intake ได้ — เดิมมีแค่ non-official ที่เปิด session
    let lineUserRef = intake.lineUserIdRef;
    if (!lineUserRef && intake.lineEvent?.lineUserId) {
      const lu = await this.prisma.lineUser.findFirst({
        where: { lineUserId: intake.lineEvent.lineUserId },
      });
      lineUserRef = lu?.id ?? null;
    }
    if (lineUserRef) {
      await this.sessions.openSession(lineUserRef, documentIntakeId, 'official');
      this.logger.log(`Opened LINE conversation session for intake ${documentIntakeId}`);
    }

    this.logger.log(`Official workflow completed for intake ${documentIntakeId}, case ${inboundCase.id}`);
  }

  private async ensureOrganization(orgId: bigint | null): Promise<bigint> {
    if (orgId) {
      const exists = await this.prisma.organization.findUnique({ where: { id: orgId } });
      if (exists) return orgId;
    }

    // Find or create default organization
    let defaultOrg = await this.prisma.organization.findFirst({
      where: { orgCode: 'DEFAULT' },
    });
    if (!defaultOrg) {
      defaultOrg = await this.prisma.organization.create({
        data: {
          name: 'หน่วยงานเริ่มต้น',
          orgCode: 'DEFAULT',
          orgType: 'school',
        },
      });
      this.logger.log(`Created default organization #${defaultOrg.id}`);
    }
    return defaultOrg.id;
  }
}
