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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { PairingService } from '../services/pairing.service';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private pairingService: PairingService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'สร้างบัญชีผู้ใช้ใหม่ (เฉพาะ ADMIN / DIRECTOR)' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ดูข้อมูลผู้ใช้ปัจจุบัน' })
  async me(@CurrentUser() user: any) {
    return this.authService.getMe(user.id);
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
  ) {
    return this.authService.switchUser(user.id, body.email, body.password);
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
  ) {
    return this.authService.impersonate(user.id, userId);
  }

  @Delete('impersonate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'หยุดการทดสอบ — คืน Admin token เดิม' })
  async stopImpersonate(@CurrentUser() user: any) {
    const adminId = (user as any)._adminId;
    if (!adminId) throw new BadRequestException('ไม่ได้อยู่ในโหมดทดสอบ');
    return this.authService.stopImpersonate(adminId);
  }
}
