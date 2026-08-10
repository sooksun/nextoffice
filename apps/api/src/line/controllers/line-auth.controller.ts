import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { LineAuthService } from '../services/line-auth.service';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard';

interface LiffLoginDto {
  accessToken: string;
}

const AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

@Controller('line-auth')
export class LineAuthController {
  constructor(private readonly lineAuth: LineAuthService) {}

  private setAuthCookie(res: Response, token: string) {
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: AUTH_COOKIE_MAX_AGE,
      path: '/',
    });
  }

  /**
   * Exchange a LIFF access token for a system JWT.
   * Called by the LIFF frontend after `liff.init()` + `liff.getAccessToken()`.
   */
  @Post('verify')
  @UseGuards(RateLimitGuard)
  // LiffBoot calls this on every LIFF page mount — keep the ceiling generous
  // enough for normal navigation, low enough to stop token-guessing loops.
  @RateLimit({ limit: 60, windowSec: 300 })
  async verify(@Body() dto: LiffLoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.lineAuth.loginWithLiffToken(dto.accessToken);
    this.setAuthCookie(res, result.token);
    return result;
  }
}
