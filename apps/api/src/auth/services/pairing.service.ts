import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class PairingService {
  private readonly logger = new Logger(PairingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generateCode(userId: number): Promise<{ code: string; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(userId) } });
    if (!user) throw new NotFoundException(`User #${userId} not found`);

    // Expire any existing unused codes for this user
    await this.prisma.userPairingCode.updateMany({
      where: { userId: BigInt(userId), usedAt: null },
      data: { expiresAt: new Date() },
    });

    const code = this.createCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.userPairingCode.create({
      data: {
        userId: BigInt(userId),
        code,
        expiresAt,
      },
    });

    this.logger.log(`Pairing code generated for user #${userId}: ${code}`);
    return { code, expiresAt };
  }

  async redeemCode(code: string, lineUserId: bigint): Promise<{ userId: number; fullName: string }> {
    const pairing = await this.prisma.userPairingCode.findUnique({
      where: { code },
      include: { user: true },
    });

    if (!pairing) {
      throw new BadRequestException('รหัสผูกบัญชีไม่ถูกต้อง');
    }
    if (pairing.usedAt) {
      throw new BadRequestException('รหัสนี้ถูกใช้แล้ว');
    }
    if (pairing.expiresAt < new Date()) {
      throw new BadRequestException('รหัสหมดอายุแล้ว กรุณาขอรหัสใหม่');
    }

    // Check if this LINE user is already linked to another User
    const existingLink = await this.prisma.user.findFirst({
      where: { lineUserRef: lineUserId },
    });
    if (existingLink) {
      throw new BadRequestException(
        `บัญชี LINE นี้ผูกกับ ${existingLink.fullName} อยู่แล้ว`,
      );
    }

    // Link User ↔ LineUser
    await this.prisma.user.update({
      where: { id: pairing.userId },
      data: { lineUserRef: lineUserId },
    });

    // Copy org + role from User → LineUser for backward compatibility
    const user = pairing.user;
    await this.prisma.lineUser.update({
      where: { id: lineUserId },
      data: {
        organizationId: user.organizationId,
        roleCode: user.roleCode,
      },
    });

    // Mark code as used
    await this.prisma.userPairingCode.update({
      where: { id: pairing.id },
      data: { usedAt: new Date(), usedByLineUserId: lineUserId },
    });

    this.logger.log(`LINE user #${lineUserId} paired with User #${user.id} (${user.fullName})`);
    return { userId: Number(user.id), fullName: user.fullName };
  }

  private createCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }
}
