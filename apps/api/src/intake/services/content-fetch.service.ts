import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ContentFetchService {
  private readonly logger = new Logger(ContentFetchService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchMessageContent(messageId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const token = this.config.get('LINE_CHANNEL_ACCESS_TOKEN');
    const res = await axios.get(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
      },
    );
    const buffer = Buffer.from(res.data);
    const contentType = res.headers['content-type'] || 'application/octet-stream';
    return { buffer, contentType };
  }

  detectMimeType(buffer: Buffer): string {
    // Check magic bytes
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
    if (buffer.slice(0, 4).toString() === '%PDF') return 'application/pdf';
    return 'application/octet-stream';
  }

  buildOriginalFilename(messageType: string, messageId: string): string {
    const ext = messageType === 'image' ? 'jpg' : messageType === 'file' ? 'pdf' : 'bin';
    return `line_${messageId}.${ext}`;
  }
}
