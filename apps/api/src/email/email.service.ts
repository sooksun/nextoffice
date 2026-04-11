import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private createTransport(cfg: SmtpConfig) {
    return nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }

  async sendOutboundDocument(opts: {
    smtpConfig: SmtpConfig;
    to: string;
    subject: string;
    documentNo: string | null;
    documentDate: string | null;
    fromOrg: string;
    bodyText: string | null;
    attachments?: { filename: string; content: Buffer }[];
  }): Promise<{ messageId: string }> {
    const transport = this.createTransport(opts.smtpConfig);

    const dateStr = opts.documentDate
      ? new Date(opts.documentDate).toLocaleDateString('th-TH', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '';

    const html = `
      <div style="font-family: 'Sarabun', sans-serif; max-width: 680px; margin: 0 auto;">
        <div style="border-bottom: 2px solid #00236f; padding-bottom: 12px; margin-bottom: 16px;">
          <h2 style="color: #00236f; margin: 0;">${opts.fromOrg}</h2>
          <p style="color: #666; margin: 4px 0 0;">ระบบสารบรรณอิเล็กทรอนิกส์</p>
        </div>
        <table style="width: 100%; font-size: 14px; margin-bottom: 16px;">
          ${opts.documentNo ? `<tr><td style="width: 80px; color: #666;">ที่</td><td><strong>${opts.documentNo}</strong></td></tr>` : ''}
          ${dateStr ? `<tr><td style="color: #666;">ลงวันที่</td><td>${dateStr}</td></tr>` : ''}
          <tr><td style="color: #666;">เรื่อง</td><td><strong>${opts.subject}</strong></td></tr>
        </table>
        ${opts.bodyText ? `<div style="white-space: pre-wrap; font-size: 14px; line-height: 1.7;">${opts.bodyText}</div>` : ''}
        <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
        <p style="font-size: 11px; color: #999;">
          ส่งจากระบบสารบรรณอิเล็กทรอนิกส์ NextOffice<br/>
          อีเมลนี้ส่งโดยอัตโนมัติ กรุณาอย่าตอบกลับ
        </p>
      </div>
    `.trim();

    const mailOpts: nodemailer.SendMailOptions = {
      from: `"${opts.fromOrg}" <${opts.smtpConfig.from}>`,
      to: opts.to,
      subject: `${opts.documentNo ? `[${opts.documentNo}] ` : ''}${opts.subject}`,
      html,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    };

    const info = await transport.sendMail(mailOpts);
    this.logger.log(`Email sent to ${opts.to} — messageId: ${info.messageId}`);
    return { messageId: info.messageId };
  }

  async testConnection(cfg: SmtpConfig): Promise<{ ok: boolean; error?: string }> {
    try {
      const transport = this.createTransport(cfg);
      await transport.verify();
      return { ok: true };
    } catch (err: any) {
      this.logger.warn(`SMTP test failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }
}
