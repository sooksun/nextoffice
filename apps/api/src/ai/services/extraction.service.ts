import { Injectable, Logger } from '@nestjs/common';
import { GeminiApiService } from '../../gemini/gemini-api.service';

export interface OfficialMetadata {
  issuingAuthority: string;
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

  constructor(private readonly gemini: GeminiApiService) {}

  async extractOfficialMetadata(extractedText: string): Promise<OfficialMetadata> {
    if (!this.gemini.getApiKey()) {
      return this.fallbackExtraction(extractedText);
    }

    const prompt = `คุณเป็นผู้ช่วยวิเคราะห์หนังสือราชการระดับผู้เชี่ยวชาญ
วิเคราะห์หนังสือราชการต่อไปนี้และสกัดข้อมูลสำคัญออกมา:

${extractedText.substring(0, 4000)}

ตอบเป็น JSON เท่านั้น ตามโครงสร้างนี้:
{
  "subject": "ชื่อเรื่องหนังสือ",
  "intent": "วัตถุประสงค์หลักของหนังสือ",
  "urgency": "สูง/กลาง/ต่ำ",
  "issuing_authority": "หน่วยงานที่ออกหนังสือ",
  "document_no": "เลขที่หนังสือ",
  "document_date": "วันที่หนังสือ (YYYY-MM-DD)",
  "deadline_date": "กำหนดส่งหรือดำเนินการ (YYYY-MM-DD หรือ null)",
  "summary": "สรุปเนื้อหาสำคัญใน 2-3 ประโยค",
  "actions": ["รายการสิ่งที่ต้องดำเนินการ"],
  "is_meeting": "true ถ้าหนังสือเป็นการเชิญประชุม/แจ้งกำหนดการประชุม/นัดหมาย ไม่ใช่ false",
  "meeting_date": "วันนัดประชุม format YYYY-MM-DD (ถ้าไม่มีให้เป็น null)",
  "meeting_time": "เวลาประชุม เช่น '10:00' หรือ '10:00-12:00' (ถ้าไม่มีให้เป็น null)",
  "meeting_location": "สถานที่ประชุม (ถ้าไม่มีให้เป็น null)"
}`;

    try {
      const rawText =
        (await this.gemini.generateText({
          user: prompt,
          maxOutputTokens: 1024,
          temperature: 0.2,
        })) || '{}';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] || '{}');

      return {
        issuingAuthority: parsed.issuing_authority || '',
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
    return {
      issuingAuthority: '',
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
