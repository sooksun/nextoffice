import { Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { OcrService } from '../../ai/services/ocr.service';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Injectable()
export class DocumentTextExtractorService {
  constructor(private readonly ocr: OcrService) {}

  async extractText(buffer: Buffer, mimeType: string, preExtractedText?: string): Promise<string> {
    if (preExtractedText?.trim()) return preExtractedText.trim();

    if (mimeType === 'text/plain') {
      return buffer.toString('utf8').trim();
    }

    if (mimeType === DOCX_MIME) {
      const result = await mammoth.extractRawText({ buffer });
      return (result.value || '').trim();
    }

    if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
      return this.ocr.extractText(buffer, mimeType);
    }

    return '';
  }
}
