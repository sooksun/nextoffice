import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../intake/services/file-storage.service';

const STAFF_ROLES = ['DIRECTOR', 'VICE_DIRECTOR', 'CLERK'] as const;

@Injectable()
export class StaffConfigService {
  private readonly logger = new Logger(StaffConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
  ) {}

  /** รายชื่อ staff DIRECTOR / VICE_DIRECTOR / CLERK ขององค์กร */
  async listStaff(orgId: number) {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: BigInt(orgId),
        roleCode: { in: STAFF_ROLES as unknown as string[] },
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        roleCode: true,
        positionTitle: true,
        signaturePath: true,
        email: true,
      },
      orderBy: [
        { roleCode: 'asc' },
        { fullName: 'asc' },
      ],
    });

    return users.map((u) => ({
      id: u.id.toString(),
      fullName: u.fullName,
      roleCode: u.roleCode,
      positionTitle: u.positionTitle ?? null,
      hasSignature: !!u.signaturePath,
      email: u.email,
    }));
  }

  /** รายชื่อ user ทั้งหมดพร้อมสถานะ LINE */
  async listUsersWithLineStatus(orgId: number) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: BigInt(orgId), isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        roleCode: true,
        positionTitle: true,
        lineUserRef: true,
        lineUser: {
          select: { lineUserId: true, displayName: true, pictureUrl: true },
        },
        pairingCodes: {
          where: { usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { code: true, expiresAt: true },
        },
      },
      orderBy: [{ roleCode: 'asc' }, { fullName: 'asc' }],
    });

    return users.map((u) => ({
      id: Number(u.id),
      fullName: u.fullName,
      email: u.email,
      roleCode: u.roleCode,
      positionTitle: u.positionTitle ?? null,
      lineConnected: !!u.lineUserRef,
      lineDisplayName: u.lineUser?.displayName ?? null,
      linePictureUrl: u.lineUser?.pictureUrl ?? null,
      lastPairingCode: u.pairingCodes[0]?.code ?? null,
      lastPairingExpiry: u.pairingCodes[0]?.expiresAt ?? null,
    }));
  }

  /** ยกเลิกการเชื่อมต่อ LINE ของ user */
  async unlinkLine(userId: number, orgId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: BigInt(userId), organizationId: BigInt(orgId) },
      select: { lineUserRef: true },
    });
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้');
    if (!user.lineUserRef) throw new BadRequestException('ผู้ใช้ไม่ได้เชื่อมต่อ LINE');

    const lineUserRef = user.lineUserRef;

    // Unlink user
    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { lineUserRef: null },
    });

    // Reset LINE user metadata
    await this.prisma.lineUser.update({
      where: { id: lineUserRef },
      data: { organizationId: null, roleCode: null },
    });

    // Expire all open sessions
    await this.prisma.lineConversationSession.updateMany({
      where: { lineUserIdRef: lineUserRef, status: { in: ['open', 'active'] } },
      data: { status: 'expired' },
    });

    this.logger.log(`LINE unlinked for user #${userId} by admin`);
    return { ok: true };
  }

  /** อัปเดต positionTitle ของ user */
  async updatePosition(userId: number, orgId: number, positionTitle: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: BigInt(userId),
        organizationId: BigInt(orgId),
        roleCode: { in: STAFF_ROLES as unknown as string[] },
      },
    });
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้');

    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { positionTitle: positionTitle.trim() || null },
    });

    return { ok: true };
  }

  /** อัปโหลด / แทนที่รูปลายเซ็น */
  async uploadSignature(
    userId: number,
    orgId: number,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('กรุณาแนบไฟล์รูปลายเซ็น');

    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('รองรับเฉพาะ PNG / JPEG / WebP');
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('ขนาดไฟล์ต้องไม่เกิน 2 MB');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: BigInt(userId),
        organizationId: BigInt(orgId),
      },
    });
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้');

    const ext = file.mimetype === 'image/png' ? 'png'
      : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const objectPath = `signatures/${orgId}/${userId}.${ext}`;

    await this.storage.saveBuffer(objectPath, file.buffer, file.mimetype);
    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { signaturePath: objectPath },
    });

    this.logger.log(`Signature uploaded for user ${userId} → ${objectPath}`);
    return { ok: true, path: objectPath };
  }

  /** ลบลายเซ็น */
  async deleteSignature(userId: number, orgId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: BigInt(userId), organizationId: BigInt(orgId) },
      select: { signaturePath: true },
    });
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้');

    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { signaturePath: null },
    });

    return { ok: true };
  }

  /** ดึงรูปลายเซ็นเป็น Buffer */
  async getSignatureBuffer(userId: number, orgId: number): Promise<{ buffer: Buffer; mimeType: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id: BigInt(userId), organizationId: BigInt(orgId) },
      select: { signaturePath: true },
    });
    if (!user?.signaturePath) throw new NotFoundException('ไม่พบรูปลายเซ็น');

    const buffer = await this.storage.getBuffer(user.signaturePath);
    const mimeType = user.signaturePath.endsWith('.png') ? 'image/png'
      : user.signaturePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

    return { buffer, mimeType };
  }
}
