import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService, SmtpConfig } from './email.service';
import { QUEUE_OUTBOUND } from '../queue/queue.constants';

@Processor(QUEUE_OUTBOUND)
export class OutboundEmailProcessor {
  private readonly logger = new Logger(OutboundEmailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  @Process('send-email')
  async handleSendEmail(job: Job<{ outboundDocId: number }>) {
    const { outboundDocId } = job.data;
    this.logger.log(`Processing email send for outbound doc #${outboundDocId}`);

    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(outboundDocId) },
      include: {
        organization: {
          select: {
            name: true,
            smtpHost: true,
            smtpPort: true,
            smtpUser: true,
            smtpPass: true,
            smtpFrom: true,
            smtpSecure: true,
          },
        },
      },
    });

    if (!doc) {
      this.logger.warn(`Outbound doc #${outboundDocId} not found`);
      return;
    }

    if (!doc.recipientEmail) {
      this.logger.warn(`No recipientEmail for doc #${outboundDocId}`);
      return;
    }

    const org = doc.organization;
    if (!org?.smtpHost || !org?.smtpUser || !org?.smtpPass || !org?.smtpFrom) {
      this.logger.warn(`SMTP not configured for org of doc #${outboundDocId}`);
      return;
    }

    const smtpConfig: SmtpConfig = {
      host: org.smtpHost,
      port: org.smtpPort ?? 587,
      user: org.smtpUser,
      pass: org.smtpPass,
      from: org.smtpFrom,
      secure: org.smtpSecure ?? false,
    };

    try {
      const result = await this.emailService.sendOutboundDocument({
        smtpConfig,
        to: doc.recipientEmail,
        subject: doc.subject,
        documentNo: doc.documentNo,
        documentDate: doc.documentDate?.toISOString() ?? null,
        fromOrg: org.name,
        bodyText: doc.bodyText,
      });

      this.logger.log(`Email sent successfully: ${result.messageId}`);
    } catch (err: any) {
      this.logger.error(`Failed to send email for doc #${outboundDocId}: ${err.message}`);
      throw err; // Bull will retry
    }
  }
}
