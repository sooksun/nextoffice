import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExtractionService } from './extraction.service';
import { ReasoningService } from '../../rag/services/reasoning.service';
import { LineMessagingService } from '../../line/services/line-messaging.service';

@Injectable()
export class OfficialWorkflowService {
  private readonly logger = new Logger(OfficialWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extraction: ExtractionService,
    private readonly reasoning: ReasoningService,
    private readonly messaging: LineMessagingService,
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
      },
    });

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
    const orgId = intake.organizationId || BigInt(1);
    const inboundCase = await this.prisma.inboundCase.create({
      data: {
        organizationId: orgId,
        title: metadata.subjectText || 'กรณีใหม่จากหนังสือราชการ',
        description: metadata.summary,
        sourceDocumentId: document.id,
        dueDate: metadata.deadlineDate ? new Date(metadata.deadlineDate) : null,
        status: 'analyzing',
      },
    });

    // Run RAG Analysis + generate options
    await this.reasoning.generateCaseOptions(inboundCase.id, orgId, metadata.subjectText);

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
        });
        await this.messaging.push(lineUserId, messages);
      }
    }

    this.logger.log(`Official workflow completed for intake ${documentIntakeId}, case ${inboundCase.id}`);
  }
}
