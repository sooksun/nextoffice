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
        documentDate: parsed.document_date || '',
        subjectText: parsed.subject || '',
        deadlineDate: parsed.deadline_date || '',
        summary: parsed.summary || '',
        intent: parsed.intent || '',
        urgency: parsed.urgency || 'กลาง',
        actions: parsed.actions || [],
        isMeeting: parsed.is_meeting === true || parsed.is_meeting === 'true',
        meetingDate: parsed.meeting_date || '',
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
