import { Injectable, Logger } from '@nestjs/common';
import { GeminiApiService } from '../../gemini/gemini-api.service';
import { SystemPromptsService } from '../../system-prompts/system-prompts.service';

export interface OfficialMetadata {
  issuingAuthority: string;
  recipient: string;
  documentNo: string;
  documentDate: string;
  subjectText: string;
  deadlineDate: string;
  summary: string;
  intent: string;
  urgency: string;
  actions: string[];
  isMeeting: boolean;
  meetingDate: string;
  meetingTime: string;
  meetingLocation: string;
}

/** Convert a date string from BE to CE if the year looks like Buddhist Era (> 2500).
 *  Accepts YYYY-MM-DD or DD/MM/YYYY. Returns YYYY-MM-DD CE string or empty string. */
function normalizeDateToCe(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = raw.trim();
  // Match YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const ceYear = year > 2500 ? year - 543 : year;
    return `${ceYear}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  // Match DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const year = parseInt(dmyMatch[3], 10);
    const ceYear = year > 2500 ? year - 543 : year;
    return `${ceYear}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  return '';
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private readonly gemini: GeminiApiService,
    private readonly prompts: SystemPromptsService,
  ) {}

  async extractOfficialMetadata(extractedText: string): Promise<OfficialMetadata> {
    if (!this.gemini.getApiKey()) {
      return this.fallbackExtraction(extractedText);
    }

    const p = await this.prompts.get('extract.metadata');
    const prompt = p.promptText.replace('{{extracted_text}}', extractedText.substring(0, 4000));

    try {
      const rawText =
        (await this.gemini.generateText({
          user: prompt,
          maxOutputTokens: p.maxTokens,
          temperature: p.temperature,
        })) || '{}';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] || '{}');

      return {
        issuingAuthority: parsed.issuing_authority || '',
        recipient: parsed.recipient || '',
        documentNo: parsed.document_no || '',
        documentDate: normalizeDateToCe(parsed.document_date),
        subjectText: parsed.subject || '',
        deadlineDate: normalizeDateToCe(parsed.deadline_date),
        summary: parsed.summary || '',
        intent: parsed.intent || '',
        urgency: parsed.urgency || 'กลาง',
        actions: parsed.actions || [],
        isMeeting: parsed.is_meeting === true || parsed.is_meeting === 'true',
        meetingDate: normalizeDateToCe(parsed.meeting_date),
        meetingTime: parsed.meeting_time || '',
        meetingLocation: parsed.meeting_location || '',
      };
    } catch (err) {
      this.logger.error(`Metadata extraction failed: ${err.message}`);
      return this.fallbackExtraction(extractedText);
    }
  }

  private fallbackExtraction(text: string): OfficialMetadata {
    const subjectMatch = text.match(/เรื่อง\s+(.+)/);
    const docNoMatch = text.match(/ที่\s+([\w\/\.-]+)/);
    const recipientMatch = text.match(/เรียน\s+(.+)/);
    return {
      issuingAuthority: '',
      recipient: recipientMatch?.[1]?.trim() || '',
      documentNo: docNoMatch?.[1] || '',
      documentDate: '',
      subjectText: subjectMatch?.[1] || '',
      deadlineDate: '',
      summary: text.substring(0, 200),
      intent: '',
      urgency: 'กลาง',
      actions: [],
      isMeeting: false,
      meetingDate: '',
      meetingTime: '',
      meetingLocation: '',
    };
  }
}
