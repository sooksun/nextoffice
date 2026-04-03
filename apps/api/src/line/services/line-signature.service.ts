import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class LineSignatureService {
  constructor(private readonly config: ConfigService) {}

  validate(signature: string, rawBody: Buffer | string): boolean {
    const secret = this.config.get<string>('LINE_CHANNEL_SECRET');
    if (!secret) {
      throw new UnauthorizedException('LINE_CHANNEL_SECRET not configured');
    }
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('base64');
    return signature === expectedSig;
  }

  validateOrThrow(signature: string, rawBody: Buffer | string): void {
    if (!this.validate(signature, rawBody)) {
      throw new UnauthorizedException('Invalid LINE signature');
    }
  }
}
