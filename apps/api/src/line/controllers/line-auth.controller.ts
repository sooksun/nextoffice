import { Body, Controller, Post } from '@nestjs/common';
import { LineAuthService } from '../services/line-auth.service';

interface LiffLoginDto {
  accessToken: string;
}

@Controller('line-auth')
export class LineAuthController {
  constructor(private readonly lineAuth: LineAuthService) {}

  /**
   * Exchange a LIFF access token for a system JWT.
   * Called by the LIFF frontend after `liff.init()` + `liff.getAccessToken()`.
   */
  @Post('verify')
  async verify(@Body() dto: LiffLoginDto) {
    return this.lineAuth.loginWithLiffToken(dto.accessToken);
  }
}
