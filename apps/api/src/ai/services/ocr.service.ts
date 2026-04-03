import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private readonly config: ConfigService) {}

  async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    // Layer 1: Try PDF text extraction for PDFs
    if (mimeType === 'application/pdf') {
      return this.extractTextFromPdf(buffer);
    }
    // Layer 2: Image OCR via Claude Vision API
    return this.extractTextFromImage(buffer, mimeType);
  }

  private async extractTextFromPdf(buffer: Buffer): Promise<string> {
    // Use Claude API to extract text from PDF base64
    const apiKey = this.config.get('ANTHROPIC_API_KEY');
    if (!apiKey) return '[PDF text extraction not configured]';

    try {
      const base64 = buffer.toString('base64');
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: this.config.get('CLAUDE_MODEL', 'claude-sonnet-4-6'),
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: base64 },
                },
                {
                  type: 'text',
                  text: 'Extract all text from this PDF document. Return only the extracted text, no commentary.',
                },
              ],
            },
          ],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        },
      );
      return res.data?.content?.[0]?.text || '';
    } catch (err) {
      this.logger.warn(`PDF text extraction failed: ${err.message}`);
      return '';
    }
  }

  private async extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string> {
    const apiKey = this.config.get('ANTHROPIC_API_KEY');
    if (!apiKey) return '[Image OCR not configured]';

    try {
      const base64 = buffer.toString('base64');
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: this.config.get('CLAUDE_MODEL', 'claude-sonnet-4-6'),
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mimeType, data: base64 },
                },
                {
                  type: 'text',
                  text: 'Extract all text visible in this image. Return only the extracted text, preserving the original structure.',
                },
              ],
            },
          ],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        },
      );
      return res.data?.content?.[0]?.text || '';
    } catch (err) {
      this.logger.warn(`Image OCR failed: ${err.message}`);
      return '';
    }
  }

  isThaiOfficialDocument(text: string): boolean {
    const keywords = ['หนังสือ', 'ที่ ', 'เรื่อง', 'เรียน', 'ด้วย', 'จึงเรียนมาเพื่อ'];
    const matchCount = keywords.filter((k) => text.includes(k)).length;
    return matchCount >= 3;
  }
}
