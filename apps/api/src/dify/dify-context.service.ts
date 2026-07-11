import { Injectable, Logger } from '@nestjs/common';
import { CasesService } from '../cases/services/cases.service';

const MAX_CONTEXT_CHARS = 6000;

/**
 * Build short letter/policy context strings for Dify inputs from NextOffice data.
 * Never sends PDFs — text summary only.
 */
@Injectable()
export class DifyContextService {
  private readonly logger = new Logger(DifyContextService.name);

  constructor(private readonly cases: CasesService) {}

  /**
   * Load case (org-scoped) and format a compact context block for Dify.
   */
  async buildCaseLetterContext(
    caseId: number,
    organizationId?: number,
    roleCode?: string,
  ): Promise<string> {
    const c = await this.cases.findById(caseId, organizationId, roleCode);
    const lines: string[] = [
      `เคส #${c.id}`,
      `เรื่อง: ${c.title ?? '—'}`,
      `สถานะ: ${c.status ?? '—'}`,
      `ความเร่งด่วน: ${c.urgencyLevel ?? '—'}`,
      `ทะเบียนรับ: ${c.registrationNo ?? '—'}`,
    ];

    if (c.description) {
      lines.push(`รายละเอียด: ${String(c.description).slice(0, 800)}`);
    }

    const intake = c.intake as
      | {
          documentNo?: string | null;
          issuingAuthority?: string | null;
          documentDate?: string | Date | null;
          summaryText?: string | null;
          nextActions?: string[];
        }
      | undefined;

    if (intake) {
      if (intake.documentNo) lines.push(`เลขที่หนังสือ: ${intake.documentNo}`);
      if (intake.issuingAuthority) lines.push(`จาก: ${intake.issuingAuthority}`);
      if (intake.documentDate) {
        const d =
          intake.documentDate instanceof Date
            ? intake.documentDate.toISOString().slice(0, 10)
            : String(intake.documentDate).slice(0, 10);
        lines.push(`ลงวันที่: ${d}`);
      }
      if (intake.summaryText) {
        lines.push(`สรุป AI: ${String(intake.summaryText).slice(0, 1500)}`);
      }
      if (intake.nextActions?.length) {
        lines.push(`สิ่งที่ต้องทำ: ${intake.nextActions.join('; ')}`);
      }
    }

    const src = c.sourceDocument as { documentCode?: string; issuingAuthority?: string } | undefined;
    if (src?.documentCode && !intake?.documentNo) {
      lines.push(`รหัสเอกสาร: ${src.documentCode}`);
    }

    const text = lines.join('\n');
    if (text.length > MAX_CONTEXT_CHARS) {
      this.logger.debug(`Truncating case #${caseId} context ${text.length}→${MAX_CONTEXT_CHARS}`);
      return text.slice(0, MAX_CONTEXT_CHARS) + '\n…';
    }
    return text;
  }
}
