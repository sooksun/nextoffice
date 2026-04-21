import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FaceClientService } from './face-client.service';
import { FileStorageService } from '../../intake/services/file-storage.service';

const MIN_TEMPLATES = 6;
const MAX_TEMPLATES = 10;

@Injectable()
export class AdminEnrollmentService {
  private readonly logger = new Logger(AdminEnrollmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly faceClient: FaceClientService,
    private readonly fileStorage: FileStorageService,
  ) {}

  // ─── List all users with enrollment status ────────────────────────────────

  async listEnrollments(
    orgId: number,
    search?: string,
    profileStatus?: string,
    page = 1,
    limit = 30,
  ) {
    const skip = (page - 1) * limit;
    const userWhere: any = {
      organizationId: BigInt(orgId),
      isActive: true,
    };
    if (search) {
      userWhere.OR = [
        { fullName: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          fullName: true,
          email: true,
          roleCode: true,
          positionTitle: true,
          department: true,
          organization: { select: { id: true, name: true, shortName: true } },
          faceProfile: {
            select: {
              id: true,
              profileStatus: true,
              templateCount: true,
              enrolledAt: true,
              lastRefreshedAt: true,
            },
          },
        },
        orderBy: [{ roleCode: 'asc' }, { fullName: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where: userWhere }),
    ]);

    let items = users.map((u) => this.serialize({
      userId: u.id,
      fullName: u.fullName,
      email: u.email,
      roleCode: u.roleCode,
      positionTitle: u.positionTitle,
      department: u.department,
      organization: u.organization,
      profileStatus: u.faceProfile?.profileStatus ?? 'none',
      templateCount: u.faceProfile?.templateCount ?? 0,
      minRequired: MIN_TEMPLATES,
      maxAllowed: MAX_TEMPLATES,
      canFinalize: (u.faceProfile?.templateCount ?? 0) >= MIN_TEMPLATES,
      enrolledAt: u.faceProfile?.enrolledAt ?? null,
    }));

    // filter by profileStatus if given
    if (profileStatus && profileStatus !== 'all') {
      items = items.filter((i: any) => i.profileStatus === profileStatus);
    }

    return { total, page, limit, minRequired: MIN_TEMPLATES, maxAllowed: MAX_TEMPLATES, items };
  }

  // ─── Get one user's face profile + templates ──────────────────────────────

  async getUserEnrollment(userId: number, orgId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: BigInt(userId), organizationId: BigInt(orgId) },
      select: {
        id: true,
        fullName: true,
        email: true,
        roleCode: true,
        positionTitle: true,
        department: true,
        organization: { select: { id: true, name: true, shortName: true } },
      },
    });
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้');

    const profile = await this.prisma.faceProfile.findUnique({
      where: { userId: BigInt(userId) },
      include: {
        templates: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return this.serialize({
      user,
      profile: profile
        ? {
            id: profile.id,
            profileStatus: profile.profileStatus,
            templateCount: profile.templateCount,
            enrolledAt: profile.enrolledAt,
            lastRefreshedAt: profile.lastRefreshedAt,
            notes: profile.notes,
          }
        : null,
      templates: (profile?.templates ?? []).map((t) => ({
        id: t.id,
        qdrantPointId: t.qdrantPointId,
        imagePath: t.imagePath,
        qualityScore: t.qualityScore,
        poseYaw: t.poseYaw,
        posePitch: t.posePitch,
        lightScore: t.lightScore,
        capturedAt: t.capturedAt,
        createdAt: t.createdAt,
      })),
      minRequired: MIN_TEMPLATES,
      maxAllowed: MAX_TEMPLATES,
      canFinalize: (profile?.templateCount ?? 0) >= MIN_TEMPLATES,
      canAddMore: (profile?.templateCount ?? 0) < MAX_TEMPLATES,
    });
  }

  // ─── Admin upload frame for a specific user ───────────────────────────────

  async adminUploadFrame(
    targetUserId: number,
    orgId: number,
    imageBase64: string,
  ) {
    // Check max limit
    const profile = await this.prisma.faceProfile.findUnique({
      where: { userId: BigInt(targetUserId) },
    });
    const currentCount = profile?.templateCount ?? 0;
    if (currentCount >= MAX_TEMPLATES) {
      throw new BadRequestException(`ถึงจำนวนสูงสุดแล้ว (${MAX_TEMPLATES} รูป) — กรุณาลบรูปเก่าก่อน`);
    }

    // Create profile if not exists
    let faceProfile = profile;
    if (!faceProfile) {
      faceProfile = await this.prisma.faceProfile.create({
        data: {
          userId: BigInt(targetUserId),
          organizationId: BigInt(orgId),
          profileStatus: 'pending',
          templateCount: 0,
        },
      });
    }

    const templateNo = faceProfile.templateCount + 1;

    // Call face service to enroll frame
    const result = await this.faceClient.enrollFrame(targetUserId, orgId, imageBase64, templateNo);
    if (!result.success) {
      return { success: false, reason: result.reason, reasons: result.reasons, quality: result.quality };
    }

    // Save image to MinIO
    const imagePath = `faces/${orgId}/${targetUserId}/template_${templateNo}_${Date.now()}.jpg`;
    let savedPath = imagePath;
    try {
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const imgBuffer = Buffer.from(base64Data, 'base64');
      await this.fileStorage.saveBuffer(imagePath, imgBuffer, 'image/jpeg');
    } catch (err) {
      this.logger.warn(`MinIO save failed (non-critical): ${err.message}`);
    }

    // Create FaceTemplate record with real MinIO path
    const template = await this.prisma.faceTemplate.create({
      data: {
        faceProfileId: faceProfile.id,
        organizationId: BigInt(orgId),
        qdrantPointId: result.pointId!,
        imagePath: savedPath,
        qualityScore: (result.quality as any)?.score ?? 0,
        poseYaw: (result.quality as any)?.pose_yaw ?? 0,
        posePitch: (result.quality as any)?.pose_pitch ?? 0,
        poseRoll: (result.quality as any)?.pose_roll ?? 0,
        lightScore: (result.quality as any)?.light_score ?? 1,
        capturedAt: new Date(),
      },
    });

    await this.prisma.faceProfile.update({
      where: { id: faceProfile.id },
      data: { templateCount: { increment: 1 } },
    });

    await this.prisma.faceAuditLog.create({
      data: {
        organizationId: BigInt(orgId),
        action: 'ENROLL_FRAME',
        entityType: 'face_template',
        entityId: template.id,
        payloadJson: JSON.stringify({ targetUserId, templateNo, pointId: result.pointId }),
      },
    });

    const newCount = faceProfile.templateCount + 1;
    return this.serialize({
      success: true,
      templateId: template.id,
      templateCount: newCount,
      minRequired: MIN_TEMPLATES,
      maxAllowed: MAX_TEMPLATES,
      canFinalize: newCount >= MIN_TEMPLATES,
      canAddMore: newCount < MAX_TEMPLATES,
      quality: result.quality,
    });
  }

  // ─── Delete a specific template ───────────────────────────────────────────

  async deleteTemplate(templateId: number, orgId: number) {
    const template = await this.prisma.faceTemplate.findFirst({
      where: { id: BigInt(templateId), organizationId: BigInt(orgId), isActive: true },
      include: { faceProfile: true },
    });
    if (!template) throw new NotFoundException('ไม่พบ face template');

    const profile = template.faceProfile;
    if (profile.templateCount <= MIN_TEMPLATES && profile.profileStatus === 'active') {
      throw new BadRequestException(
        `ไม่สามารถลบได้ — จะเหลือน้อยกว่า ${MIN_TEMPLATES} รูป ซึ่งต่ำกว่าขั้นต่ำ`
      );
    }

    // Soft-delete in DB
    await this.prisma.faceTemplate.update({
      where: { id: BigInt(templateId) },
      data: { isActive: false },
    });

    // Deactivate in Qdrant
    try {
      await this.faceClient.deactivateTemplate(template.qdrantPointId);
    } catch (err) {
      this.logger.warn(`Qdrant deactivate failed: ${err.message}`);
    }

    // Update profile template count
    const newCount = Math.max(0, (profile.templateCount ?? 1) - 1);
    const newStatus = newCount < MIN_TEMPLATES && profile.profileStatus === 'active'
      ? 'needs_refresh'
      : profile.profileStatus;

    await this.prisma.faceProfile.update({
      where: { id: profile.id },
      data: {
        templateCount: newCount,
        profileStatus: newStatus,
      },
    });

    await this.prisma.faceAuditLog.create({
      data: {
        organizationId: BigInt(orgId),
        action: 'TEMPLATE_DELETE',
        entityType: 'face_template',
        entityId: BigInt(templateId),
        payloadJson: JSON.stringify({ qdrantPointId: template.qdrantPointId, newCount }),
      },
    });

    return { success: true, newCount, profileStatus: newStatus };
  }

  // ─── Activate / finalize enrollment (admin override) ─────────────────────

  async activateProfile(targetUserId: number, orgId: number) {
    const profile = await this.prisma.faceProfile.findUnique({
      where: { userId: BigInt(targetUserId) },
    });
    if (!profile) throw new NotFoundException('ไม่พบ face profile');
    if (profile.templateCount < MIN_TEMPLATES) {
      throw new BadRequestException(`ต้องมีอย่างน้อย ${MIN_TEMPLATES} รูป (มี ${profile.templateCount})`);
    }

    await this.prisma.faceProfile.update({
      where: { id: profile.id },
      data: { profileStatus: 'active', enrolledAt: new Date() },
    });

    await this.prisma.faceAuditLog.create({
      data: {
        organizationId: BigInt(orgId),
        action: 'ENROLL_FINALIZE',
        entityType: 'face_profile',
        entityId: profile.id,
        payloadJson: JSON.stringify({ targetUserId, templateCount: profile.templateCount }),
      },
    });

    return { success: true, profileStatus: 'active' };
  }

  // ─── Reset profile (delete all templates) ─────────────────────────────────

  async resetProfile(targetUserId: number, orgId: number) {
    const profile = await this.prisma.faceProfile.findUnique({
      where: { userId: BigInt(targetUserId) },
      include: { templates: { where: { isActive: true } } },
    });
    if (!profile) throw new NotFoundException('ไม่พบ face profile');

    // Deactivate all Qdrant points
    for (const t of profile.templates) {
      try {
        await this.faceClient.deactivateTemplate(t.qdrantPointId);
      } catch { /* non-critical */ }
    }

    // Soft-delete all templates
    await this.prisma.faceTemplate.updateMany({
      where: { faceProfileId: profile.id, isActive: true },
      data: { isActive: false },
    });

    await this.prisma.faceProfile.update({
      where: { id: profile.id },
      data: { profileStatus: 'pending', templateCount: 0, enrolledAt: null },
    });

    await this.prisma.faceAuditLog.create({
      data: {
        organizationId: BigInt(orgId),
        action: 'ENROLL_FRAME',
        entityType: 'face_profile',
        entityId: profile.id,
        payloadJson: JSON.stringify({ action: 'reset', targetUserId, deletedCount: profile.templates.length }),
      },
    });

    return { success: true, profileStatus: 'pending', templateCount: 0 };
  }

  // ─── Serve template image from MinIO ─────────────────────────────────────

  async getTemplateImageBuffer(templateId: number, orgId: number): Promise<{ buffer: Buffer; path: string }> {
    const template = await this.prisma.faceTemplate.findFirst({
      where: { id: BigInt(templateId), organizationId: BigInt(orgId) },
    });
    if (!template) throw new NotFoundException('ไม่พบ face template');

    const buffer = await this.fileStorage.getBuffer(template.imagePath);
    return { buffer, path: template.imagePath };
  }

  // ─── Helper ───────────────────────────────────────────────────────────────

  private serialize(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return Number(obj);
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map((v) => this.serialize(v));
    if (typeof obj === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) out[k] = this.serialize(v);
      return out;
    }
    return obj;
  }
}
