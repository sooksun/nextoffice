import { Injectable, Logger } from '@nestjs/common';
import { GeminiApiService } from '../../gemini/gemini-api.service';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private readonly gemini: GeminiApiService) {}

  async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
      return this.extractTextFromPdf(buffer);
    }
    return this.extractTextFromImage(buffer, mimeType);
  }

  private async extractTextFromPdf(buffer: Buffer): Promise<string> {
    if (!this.gemini.getApiKey()) return '[PDF text extraction not configured]';

    try {
      const base64 = buffer.toString('base64');
      const text = await this.gemini.generateFromParts({
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64,
            },
          },
          {
            text: 'Extract all text from this PDF document. Return only the extracted text, no commentary.',
          },
        ],
        maxOutputTokens: 4096,
        temperature: 0.1,
      });
      return text || '';
    } catch (err) {
      this.gemini.logAxiosError('PDF text extraction', err);
      return '';
    }
  }

  private async extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string> {
    if (!this.gemini.getApiKey()) return '[Image OCR not configured]';

    try {
      const base64 = buffer.toString('base64');
      const text = await this.gemini.generateFromParts({
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: base64,
            },
          },
          {
            text: 'Extract all text visible in this image. Return only the extracted text, preserving the original structure.',
          },
        ],
        maxOutputTokens: 4096,
        temperature: 0.1,
      });
      return text || '';
    } catch (err) {
      this.gemini.logAxiosError('Image OCR', err);
      return '';
    }
  }

  isThaiOfficialDocument(text: string): boolean {
    const keywords = ['หนังสือ', 'ที่ ', 'เรื่อง', 'เรียน', 'ด้วย', 'จึงเรียนมาเพื่อ'];
    const matchCount = keywords.filter((k) => text.includes(k)).length;
    return matchCount >= 3;
  }
}
