import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../../auth/services/auth.service';

interface LineVerifyResponse {
  scope: string;
  client_id: string;
  expires_in: number;
}

interface LineProfileResponse {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

@Injectable()
export class LineAuthService {
  private readonly logger = new Logger(LineAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verify a LIFF access token with LINE's OAuth endpoint, fetch the user's
   * LINE profile, look up the linked system user, and issue a JWT.
   *
   * Throws UnauthorizedException if:
   *  - token invalid / expired
   *  - token's client_id doesn't match our LINE Login channel (if configured)
   *  - LINE user has no system-user link (needs pairing via LINE bot first)
   */
  async loginWithLiffToken(accessToken: string) {
    if (!accessToken) throw new UnauthorizedException('Missing LINE access token');

    // 1. Verify token with LINE
    let verify: LineVerifyResponse;
    try {
      const res = await axios.get<LineVerifyResponse>(
        'https://api.line.me/oauth2/v2.1/verify',
        { params: { access_token: accessToken }, timeout: 10000 },
      );
      verify = res.data;
    } catch (err: any) {
      this.logger.warn(`LINE token verify failed: ${err.message}`);
      throw new UnauthorizedException('LINE access token ไม่ถูกต้องหรือหมดอายุ');
    }

    // 2. Check channel (audience) — if env var is set
    const expectedChannelId = this.config.get<string>('LINE_LOGIN_CHANNEL_ID');
    if (expectedChannelId && verify.client_id !== expectedChannelId) {
      this.logger.warn(`LINE token channel mismatch: got=${verify.client_id} expected=${expectedChannelId}`);
      throw new UnauthorizedException('Token มาจาก LINE channel ที่ไม่ถูกต้อง');
    }

    // 3. Fetch LINE profile
    let profile: LineProfileResponse;
    try {
      const res = await axios.get<LineProfileResponse>('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });
      profile = res.data;
    } catch (err: any) {
      this.logger.warn(`LINE profile fetch failed: ${err.message}`);
      throw new UnauthorizedException('ไม่สามารถโหลดโปรไฟล์ LINE ได้');
    }

    // 4. Look up LineUser → User
    const lineUser = await this.prisma.lineUser.findUnique({
      where: { lineUserId: profile.userId },
    });
    if (!lineUser) {
      throw new UnauthorizedException('บัญชี LINE นี้ยังไม่ได้เชื่อมกับระบบ กรุณาทักบอทเพื่อจับคู่บัญชีก่อน');
    }

    const user = await this.prisma.user.findFirst({
      where: { lineUserRef: lineUser.id, isActive: true },
    });
    if (!user) {
      throw new UnauthorizedException('บัญชี LINE นี้ยังไม่ได้ผูกกับผู้ใช้ในระบบ');
    }

    // 5. Issue JWT via AuthService
    return this.auth.createSessionForUserId(user.id);
  }
}
