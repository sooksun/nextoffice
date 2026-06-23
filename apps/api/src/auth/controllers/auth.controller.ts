import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { PairingService } from '../services/pairing.service';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';

const AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private pairingService: PairingService,
  ) {}

  /** Set the JWT as an httpOnly cookie so XSS cannot read it (defense-in-depth alongside Bearer). */
  private setAuthCookie(res: Response, token: string) {
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: AUTH_COOKIE_MAX_AGE,
      path: '/',
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    this.setAuthCookie(res, result.token);
    return result;
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'เข้าสู่ระบบด้วย Google (ID Token)' })
  async googleLogin(
    @Body() body: { idToken: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithGoogle(body.idToken);
    this.setAuthCookie(res, result.token);
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ออกจากระบบ — ล้าง httpOnly cookie' })
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('token', { path: '/' });
    return { ok: true };
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'สร้างบัญชีผู้ใช้ใหม่ (เฉพาะ ADMIN / DIRECTOR) — ADMIN เท่านั้นสร้าง ADMIN ได้' })
  async register(@Body() dto: RegisterDto, @CurrentUser() user: any) {
    return this.authService.register(dto, user.roleCode, Number(user.organizationId));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ดูข้อมูลผู้ใช้ปัจจุบัน' })
  async me(@CurrentUser() user: any) {
    const me = await this.authService.getMe(user.id);
    if ((user as any)._adminId) (me as any)._adminId = (user as any)._adminId;
    return me;
  }

  @Get('users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'รายชื่อผู้ใช้ในหน่วยงานเดียวกัน' })
  @ApiQuery({ name: 'organizationId', required: false, type: Number })
  async listUsers(
    @CurrentUser() user: any,
    @Query('organizationId') orgId?: string,
  ) {
    const effectiveOrgId = (user.roleCode === 'ADMIN' && orgId)
      ? Number(orgId)
      : Number(user.organizationId);
    return this.authService.listUsers(effectiveOrgId);
  }

  @Post('users/:userId/pairing-code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'สร้างรหัสผูกบัญชี LINE (6 หลัก, หมดอายุ 24 ชม.)' })
  async generatePairingCode(@Param('userId', ParseIntPipe) userId: number) {
    return this.pairingService.generateCode(userId);
  }

  // ─── Impersonation (Admin only) ───────────────────────────────────────────

  @Post('switch-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin สลับ session เป็น user อื่น โดยกรอก email+password ของ user นั้น' })
  async switchUser(
    @Body() body: { email: string; password: string },
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.switchUser(user.id, body.email, body.password);
    if ((result as any)?.token) this.setAuthCookie(res, (result as any).token);
    return result;
  }

  @Get('users/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'รายชื่อผู้ใช้ทั้งหมด (Admin เท่านั้น — ใช้สำหรับ impersonation)' })
  async listAllUsers() {
    return this.authService.listAllUsers();
  }

  @Post('impersonate/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin ทดสอบในฐานะผู้ใช้อื่น — คืน token ใหม่' })
  async impersonate(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.impersonate(user.id, userId);
    if ((result as any)?.token) this.setAuthCookie(res, (result as any).token);
    return result;
  }

  @Delete('impersonate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'หยุดการทดสอบ — คืน Admin token เดิม' })
  async stopImpersonate(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const adminId = (user as any)._adminId;
    if (!adminId) throw new BadRequestException('ไม่ได้อยู่ในโหมดทดสอบ');
    const result = await this.authService.stopImpersonate(adminId);
    if ((result as any)?.token) this.setAuthCookie(res, (result as any).token);
    return result;
  }
}
