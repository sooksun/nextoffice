import {
  Injectable,
  UnauthorizedException,
  ConflictException,
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

  // ─── Token validation (used by guard) ───────────────────────────────────────

  async validateToken(token: string) {
    try {
      const secret = this.config.get<string>('JWT_SECRET', 'nextoffice-dev-secret');
      const payload = jwt.verify(token, secret) as { sub: string; role: string };
      const user = await this.prisma.user.findUnique({
        where: { id: BigInt(payload.sub) },
        include: { organization: true },
      });
      if (!user || !user.isActive) return null;
      return user;
    } catch {
      return null;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private signToken(user: any): string {
    const secret = this.config.get<string>('JWT_SECRET', 'nextoffice-dev-secret');
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN', '7d');
    return jwt.sign(
      { sub: user.id.toString(), role: user.roleCode },
      secret,
      { expiresIn: expiresIn as any },
    );
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
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
