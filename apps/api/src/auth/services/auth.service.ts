import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // ─── Login ──────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { organization: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    const isValid = await this.verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    // Update lastLoginAt
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = this.signToken(user);

    return {
      token,
      user: this.serializeUser(user),
    };
  }

  // ─── Register ───────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('อีเมลนี้มีในระบบแล้ว');
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        roleCode: dto.roleCode,
        organizationId: dto.organizationId
          ? BigInt(dto.organizationId)
          : undefined,
        positionTitle: dto.positionTitle,
        department: dto.department,
        responsibilities: dto.responsibilities,
        phone: dto.phone,
        googleEmail: dto.googleEmail,
      },
      include: { organization: true },
    });

    const token = this.signToken(user);

    return {
      token,
      user: this.serializeUser(user),
    };
  }

  // ─── Get current user ───────────────────────────────────────────────────────

  async getMe(userId: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user) throw new UnauthorizedException('ผู้ใช้ไม่พบ');
    return this.serializeUser(user);
  }

  // ─── List users by organization ──────────────────────────────────────────────

  async listUsers(organizationId: number) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: BigInt(organizationId), isActive: true },
      select: { id: true, fullName: true, roleCode: true, department: true, positionTitle: true },
      orderBy: { fullName: 'asc' },
    });
    return users.map((u) => ({
      id: Number(u.id),
      fullName: u.fullName,
      roleCode: u.roleCode,
      department: u.department,
      positionTitle: u.positionTitle,
    }));
  }

  // ─── Impersonation ──────────────────────────────────────────────────────────

  async switchUser(adminId: bigint, email: string, password: string) {
    const target = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { organization: true },
    });
    if (!target || !target.isActive) throw new UnauthorizedException('ไม่พบบัญชีผู้ใช้นี้ในระบบ');
    if (target.roleCode === 'ADMIN') throw new BadRequestException('ไม่สามารถสลับเป็นบัญชี Admin ได้');

    const isValid = await this.verifyPassword(password, target.passwordHash);
    if (!isValid) throw new UnauthorizedException('รหัสผ่านไม่ถูกต้อง');

    const token = this.signToken(target, Number(adminId));
    return { token, user: { ...this.serializeUser(target), _adminId: Number(adminId) } };
  }

  async impersonate(adminId: bigint, targetUserId: number) {
    const target = await this.prisma.user.findUnique({
      where: { id: BigInt(targetUserId), isActive: true },
      include: { organization: true },
    });
    if (!target) throw new NotFoundException('ไม่พบผู้ใช้ที่ต้องการทดสอบ');
    if (target.roleCode === 'ADMIN') throw new BadRequestException('ไม่สามารถทดสอบในฐานะ Admin ได้');

    const token = this.signToken(target, Number(adminId));
    return { token, user: { ...this.serializeUser(target), _adminId: Number(adminId) } };
  }

  async stopImpersonate(adminId: number) {
    const admin = await this.prisma.user.findUnique({
      where: { id: BigInt(adminId) },
      include: { organization: true },
    });
    if (!admin || !admin.isActive) throw new UnauthorizedException('ไม่พบบัญชี Admin');
    if (admin.roleCode !== 'ADMIN') throw new ForbiddenException();
    const token = this.signToken(admin);
    return { token, user: this.serializeUser(admin) };
  }

  async listAllUsers() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, roleCode: true, department: true, positionTitle: true, organizationId: true },
      orderBy: [{ organizationId: 'asc' }, { fullName: 'asc' }],
    });
    return users.map((u) => ({
      id: Number(u.id),
      fullName: u.fullName,
      roleCode: u.roleCode,
      department: u.department,
      positionTitle: u.positionTitle,
      organizationId: u.organizationId ? Number(u.organizationId) : null,
    }));
  }

  // ─── Token validation (used by guard) ───────────────────────────────────────

  async validateToken(token: string) {
    try {
      const secret = this.config.get<string>('JWT_SECRET', 'nextoffice-dev-secret');
      const payload = jwt.verify(token, secret) as { sub: string; role: string; _adminId?: string };
      const user = await this.prisma.user.findUnique({
        where: { id: BigInt(payload.sub) },
        include: { organization: true },
      });
      if (!user || !user.isActive) return null;
      // Attach impersonation metadata so controllers can read it
      if (payload._adminId) (user as any)._adminId = Number(payload._adminId);
      return user;
    } catch {
      return null;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private signToken(user: any, adminId?: number): string {
    const secret = this.config.get<string>('JWT_SECRET', 'nextoffice-dev-secret');
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN', '7d');
    const payload: any = { sub: user.id.toString(), role: user.roleCode };
    if (adminId) payload._adminId = adminId.toString();
    return jwt.sign(payload, secret, { expiresIn: expiresIn as any });
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(`${salt}:${derivedKey.toString('hex')}`);
      });
    });
  }

  private async verifyPassword(
    password: string,
    hash: string,
  ): Promise<boolean> {
    const [salt, key] = hash.split(':');
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(derivedKey.toString('hex') === key);
      });
    });
  }

  private serializeUser(user: any) {
    return {
      id: Number(user.id),
      email: user.email,
      fullName: user.fullName,
      roleCode: user.roleCode,
      organizationId: user.organizationId
        ? Number(user.organizationId)
        : null,
      organizationName: user.organization?.name ?? null,
      positionTitle: user.positionTitle,
      department: user.department,
      responsibilities: user.responsibilities,
      phone: user.phone,
      googleEmail: user.googleEmail,
      lineUserRef: user.lineUserRef ? Number(user.lineUserRef) : null,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
