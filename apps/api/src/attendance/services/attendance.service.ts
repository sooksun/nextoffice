import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FaceClientService } from './face-client.service';
import { GeofenceService } from './geofence.service';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly faceClient: FaceClientService,
    private readonly geofence: GeofenceService,
  ) {}

  // ─── Face Registration ──────────────────────────────

  /** Bangkok UTC+7 — handles server ≠ school timezone mismatch */
  private nowBangkok(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  }

  async registerFace(userId: number, orgId: number, imageBase64: string) {
    const result = await this.faceClient.registerFace(userId, imageBase64);
    if (!result.success) {
      throw new BadRequestException(result.message);
    }

    // Revoke existing registration AND delete the old embedding file from face service
    const activeRegs = await this.prisma.faceRegistration.findMany({
      where: { userId: BigInt(userId), status: 'active' },
    });
    if (activeRegs.length > 0) {
      await this.prisma.faceRegistration.updateMany({
        where: { userId: BigInt(userId), status: 'active' },
        data: { status: 'revoked', revokedAt: new Date() },
      });
      // Best-effort: delete old embedding from disk (re-register overwrites it anyway, but clean up)
      await this.faceClient.deleteFace(userId).catch(() => {});
    }

    const reg = await this.prisma.faceRegistration.create({
      data: {
        userId: BigInt(userId),
        organizationId: BigInt(orgId),
        faceImagePath: `faces/${userId}/registered.jpg`,
        faceEncodingId: result.faceId,
        status: 'active',
      },
    });

    return this.serialize({
      id: reg.id,
      status: reg.status,
      confidence: result.confidence,
      message: result.message,
    });
  }

  async getFaceStatus(userId: number) {
    const reg = await this.prisma.faceRegistration.findFirst({
      where: { userId: BigInt(userId), status: 'active' },
    });
    return {
      registered: !!reg,
      registeredAt: reg?.registeredAt?.toISOString() || null,
    };
  }

  // ─── Check In ───────────────────────────────────────

  async checkIn(
    userId: number,
    orgId: number,
    imageBase64: string,
    latitude: number,
    longitude: number,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already checked in today
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { userId_attendanceDate: { userId: BigInt(userId), attendanceDate: today } },
    });
    if (existing?.checkInAt) {
      throw new BadRequestException('ลงเวลาเข้าวันนี้แล้ว');
    }

    // Verify face
    const faceResult = await this.faceClient.verifyFace(userId, imageBase64);
    if (!faceResult.matched) {
      throw new BadRequestException(`ยืนยันใบหน้าไม่สำเร็จ: ${faceResult.message}`);
    }

    // Check geofence
    const org = await this.prisma.organization.findUnique({
      where: { id: BigInt(orgId) },
      select: { refLatitude: true, refLongitude: true, geofenceRadius: true, lateCheckInHour: true, lateCheckInMinute: true },
    });

    let geofenceValid = true;
    let distance = 0;
    if (org?.refLatitude && org?.refLongitude) {
      const check = this.geofence.isWithinGeofence(
        latitude, longitude,
        org.refLatitude, org.refLongitude,
        org.geofenceRadius,
      );
      geofenceValid = check.valid;
      distance = check.distance;
    }

    // Determine if late — use Bangkok time, threshold from org settings (default 08:30)
    const now = this.nowBangkok();
    const lateH = org?.lateCheckInHour ?? 8;
    const lateM = org?.lateCheckInMinute ?? 30;
    const isLate = now.getHours() > lateH || (now.getHours() === lateH && now.getMinutes() > lateM);

    const record = existing
      ? await this.prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            checkInAt: new Date(),
            checkInLatitude: latitude,
            checkInLongitude: longitude,
            faceMatchScore: faceResult.similarity,
            geofenceValid,
            status: isLate ? 'late' : 'checked_in',
          },
        })
      : await this.prisma.attendanceRecord.create({
          data: {
            userId: BigInt(userId),
            organizationId: BigInt(orgId),
            attendanceDate: today,
            checkInAt: now,
            checkInLatitude: latitude,
            checkInLongitude: longitude,
            faceMatchScore: faceResult.similarity,
            geofenceValid,
            status: isLate ? 'late' : 'checked_in',
          },
        });

    return this.serialize({
      id: record.id,
      checkInAt: record.checkInAt,
      status: record.status,
      faceMatchScore: faceResult.similarity,
      geofenceValid,
      distance,
      message: geofenceValid
        ? `ลงเวลาเข้าสำเร็จ${isLate ? ' (สาย)' : ''}`
        : `ลงเวลาเข้าสำเร็จ แต่ตำแหน่งอยู่นอกเขตโรงเรียน (${distance}m)`,
    });
  }

  // ─── Check Out ──────────────────────────────────────

  async checkOut(
    userId: number,
    orgId: number,
    imageBase64: string,
    latitude: number,
    longitude: number,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { userId_attendanceDate: { userId: BigInt(userId), attendanceDate: today } },
    });

    if (!existing?.checkInAt) {
      throw new BadRequestException('ยังไม่ได้ลงเวลาเข้าวันนี้');
    }
    if (existing.checkOutAt) {
      throw new BadRequestException('ลงเวลาออกวันนี้แล้ว');
    }

    // Verify face
    const faceResult = await this.faceClient.verifyFace(userId, imageBase64);
    if (!faceResult.matched) {
      throw new BadRequestException(`ยืนยันใบหน้าไม่สำเร็จ: ${faceResult.message}`);
    }

    // Check geofence on check-out too
    const org = await this.prisma.organization.findUnique({
      where: { id: BigInt(orgId) },
      select: { refLatitude: true, refLongitude: true, geofenceRadius: true },
    });

    let geofenceValid = true;
    let distance = 0;
    if (org?.refLatitude && org?.refLongitude) {
      const check = this.geofence.isWithinGeofence(
        latitude, longitude,
        org.refLatitude, org.refLongitude,
        org.geofenceRadius,
      );
      geofenceValid = check.valid;
      distance = check.distance;
    }

    const record = await this.prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        checkOutAt: new Date(),
        checkOutLatitude: latitude,
        checkOutLongitude: longitude,
        status: 'checked_out',
      },
    });

    return this.serialize({
      id: record.id,
      checkInAt: record.checkInAt,
      checkOutAt: record.checkOutAt,
      status: record.status,
      geofenceValid,
      distance,
      message: geofenceValid
        ? 'ลงเวลาออกสำเร็จ'
        : `ลงเวลาออกสำเร็จ แต่ตำแหน่งอยู่นอกเขตโรงเรียน (${distance}m)`,
    });
  }

  // ─── Queries ────────────────────────────────────────

  async getToday(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await this.prisma.attendanceRecord.findUnique({
      where: { userId_attendanceDate: { userId: BigInt(userId), attendanceDate: today } },
    });

    if (!record) {
      return { date: today.toISOString().split('T')[0], status: 'not_checked_in', checkInAt: null, checkOutAt: null };
    }

    return this.serialize({
      id: record.id,
      date: record.attendanceDate,
      status: record.status,
      checkInAt: record.checkInAt,
      checkOutAt: record.checkOutAt,
      faceMatchScore: record.faceMatchScore,
      geofenceValid: record.geofenceValid,
    });
  }

  async getHistory(userId: number, month?: number, year?: number) {
    const now = new Date();
    const m = month ?? now.getMonth() + 1;
    const y = year ?? now.getFullYear();
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0);

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        userId: BigInt(userId),
        attendanceDate: { gte: startDate, lte: endDate },
      },
      orderBy: { attendanceDate: 'desc' },
    });

    return records.map((r) => this.serialize({
      id: r.id,
      date: r.attendanceDate,
      status: r.status,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      geofenceValid: r.geofenceValid,
    }));
  }

  // ─── V2: Enrollment ─────────────────────────────────

  async getEnrollmentStatus(userId: number, orgId: number) {
    const profile = await this.prisma.faceProfile.findUnique({
      where: { userId: BigInt(userId) },
      include: { templates: { where: { isActive: true }, select: { id: true, qualityScore: true, capturedAt: true } } },
    });

    const config = await this.prisma.faceSchoolConfig.findUnique({
      where: { organizationId: BigInt(orgId) },
    });
    const required = config?.minTemplatesRequired ?? 8;

    if (!profile) {
      return { profileStatus: 'none', templateCount: 0, required, canFinalize: false };
    }
    return this.serialize({
      profileStatus: profile.profileStatus,
      templateCount: profile.templateCount,
      required,
      canFinalize: profile.templateCount >= required,
      enrolledAt: profile.enrolledAt,
    });
  }

  async enrollFrame(userId: number, orgId: number, imageBase64: string) {
    // Ensure FaceProfile exists
    let profile = await this.prisma.faceProfile.findUnique({ where: { userId: BigInt(userId) } });
    if (!profile) {
      profile = await this.prisma.faceProfile.create({
        data: { userId: BigInt(userId), organizationId: BigInt(orgId), profileStatus: 'pending', templateCount: 0 },
      });
    }

    const templateNo = profile.templateCount + 1;
    const result = await this.faceClient.enrollFrame(userId, orgId, imageBase64, templateNo);

    if (!result.success) {
      return { success: false, reason: result.reason, reasons: result.reasons, quality: result.quality };
    }

    // Save FaceTemplate record
    await this.prisma.faceTemplate.create({
      data: {
        faceProfileId: profile.id,
        organizationId: BigInt(orgId),
        qdrantPointId: result.pointId!,
        imagePath: `faces/v2/${userId}/template_${templateNo}.jpg`,
        qualityScore: (result.quality as any)?.score ?? 0,
        poseYaw: (result.quality as any)?.pose_yaw ?? 0,
        posePitch: (result.quality as any)?.pose_pitch ?? 0,
        poseRoll: (result.quality as any)?.pose_roll ?? 0,
        lightScore: (result.quality as any)?.light_score ?? 1,
        capturedAt: new Date(),
      },
    });

    await this.prisma.faceProfile.update({
      where: { id: profile.id },
      data: { templateCount: { increment: 1 } },
    });

    await this.prisma.faceAuditLog.create({
      data: {
        organizationId: BigInt(orgId),
        actorId: BigInt(userId),
        action: 'ENROLL_FRAME',
        entityType: 'face_template',
        payloadJson: JSON.stringify({ templateNo, pointId: result.pointId, quality: result.quality }),
      },
    });

    const config = await this.prisma.faceSchoolConfig.findUnique({ where: { organizationId: BigInt(orgId) } });
    const required = config?.minTemplatesRequired ?? 8;
    const newCount = templateNo;

    return { success: true, templateCount: newCount, required, canFinalize: newCount >= required, quality: result.quality };
  }

  async finalizeEnrollment(userId: number, orgId: number) {
    const profile = await this.prisma.faceProfile.findUnique({ where: { userId: BigInt(userId) } });
    if (!profile) throw new NotFoundException('Face profile not found');

    const config = await this.prisma.faceSchoolConfig.findUnique({ where: { organizationId: BigInt(orgId) } });
    const required = config?.minTemplatesRequired ?? 8;

    if (profile.templateCount < required) {
      throw new BadRequestException(`ต้องมีอย่างน้อย ${required} ภาพ (มี ${profile.templateCount})`);
    }

    await this.prisma.faceProfile.update({
      where: { id: profile.id },
      data: { profileStatus: 'active', enrolledAt: new Date() },
    });

    await this.prisma.faceAuditLog.create({
      data: {
        organizationId: BigInt(orgId),
        actorId: BigInt(userId),
        action: 'ENROLL_FINALIZE',
        entityType: 'face_profile',
        entityId: profile.id,
        payloadJson: JSON.stringify({ templateCount: profile.templateCount }),
      },
    });

    return { success: true, profileStatus: 'active', templateCount: profile.templateCount };
  }

  // ─── V2: Scan check-in ──────────────────────────────

  async checkInV2(
    userId: number,
    orgId: number,
    frames: string[],
    latitude: number,
    longitude: number,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { userId_attendanceDate: { userId: BigInt(userId), attendanceDate: today } },
    });
    if (existing?.checkInAt && existing.decision === 'accepted') {
      throw new BadRequestException('ลงเวลาเข้าวันนี้แล้ว');
    }

    const config = await this.prisma.faceSchoolConfig.findUnique({ where: { organizationId: BigInt(orgId) } });
    const faceConfig = config ? {
      accept_threshold: config.acceptThreshold,
      review_threshold: config.reviewThreshold,
      min_margin: config.minMargin,
      min_quality_score: config.minQualityScore,
      min_liveness_score: config.minLivenessScore,
      liveness_mode: config.livenessMode,
    } : {};

    const scan = await this.faceClient.scanVerify(orgId, frames, faceConfig, config?.livenessMode !== 'off');

    const org = await this.prisma.organization.findUnique({
      where: { id: BigInt(orgId) },
      select: { refLatitude: true, refLongitude: true, geofenceRadius: true, lateCheckInHour: true, lateCheckInMinute: true },
    });

    let geofenceValid = true;
    let distance = 0;
    if (org?.refLatitude && org?.refLongitude) {
      const check = this.geofence.isWithinGeofence(latitude, longitude, org.refLatitude, org.refLongitude, org.geofenceRadius);
      geofenceValid = check.valid;
      distance = check.distance;
    }

    const now = this.nowBangkok();
    const lateH = org?.lateCheckInHour ?? 8;
    const lateM = org?.lateCheckInMinute ?? 30;
    const isLate = now.getHours() > lateH || (now.getHours() === lateH && now.getMinutes() > lateM);

    // Resolve confirmed userId
    const confirmedUserId = scan.top1UserId ? BigInt(scan.top1UserId) : BigInt(userId);

    if (scan.decision === 'rejected') {
      return this.serialize({
        success: false,
        decision: 'rejected',
        reasonCodes: scan.reasonCodes,
        qualityScore: scan.qualityScore,
        message: 'ยืนยันใบหน้าไม่สำเร็จ',
      });
    }

    let status: string;
    if (scan.decision === 'review') {
      status = 'pending_review';
    } else {
      status = isLate ? 'late' : 'checked_in';
    }

    const record = existing
      ? await this.prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            checkInAt: now,
            checkInLatitude: latitude,
            checkInLongitude: longitude,
            faceMatchScore: scan.top1Score,
            geofenceValid,
            status,
            top1UserId: scan.top1UserId ? BigInt(scan.top1UserId) : null,
            top1Score: scan.top1Score,
            top2UserId: scan.top2UserId ? BigInt(scan.top2UserId) : null,
            top2Score: scan.top2Score,
            scoreMargin: scan.scoreMargin,
            qualityScore: scan.qualityScore,
            livenessScore: scan.livenessScore,
            decision: scan.decision,
            decisionReasons: scan.reasonCodes.join(','),
          },
        })
      : await this.prisma.attendanceRecord.create({
          data: {
            userId: confirmedUserId,
            organizationId: BigInt(orgId),
            attendanceDate: today,
            checkInAt: now,
            checkInLatitude: latitude,
            checkInLongitude: longitude,
            faceMatchScore: scan.top1Score,
            geofenceValid,
            status,
            top1UserId: scan.top1UserId ? BigInt(scan.top1UserId) : null,
            top1Score: scan.top1Score,
            top2UserId: scan.top2UserId ? BigInt(scan.top2UserId) : null,
            top2Score: scan.top2Score,
            scoreMargin: scan.scoreMargin,
            qualityScore: scan.qualityScore,
            livenessScore: scan.livenessScore,
            decision: scan.decision,
            decisionReasons: scan.reasonCodes.join(','),
          },
        });

    // Create review if needed
    if (scan.decision === 'review') {
      await this.prisma.attendanceReview.upsert({
        where: { attendanceId: record.id },
        create: { attendanceId: record.id, organizationId: BigInt(orgId), reviewStatus: 'pending' },
        update: { reviewStatus: 'pending', reviewedAt: null, reviewerId: null },
      });
    }

    await this.prisma.faceAuditLog.create({
      data: {
        organizationId: BigInt(orgId),
        actorId: BigInt(userId),
        action: 'SCAN',
        entityType: 'attendance_review',
        entityId: record.id,
        payloadJson: JSON.stringify({ decision: scan.decision, top1Score: scan.top1Score, reasonCodes: scan.reasonCodes }),
      },
    });

    return this.serialize({
      success: true,
      decision: scan.decision,
      status: record.status,
      checkInAt: record.checkInAt,
      geofenceValid,
      distance,
      top1Score: scan.top1Score,
      qualityScore: scan.qualityScore,
      reasonCodes: scan.reasonCodes,
      message: scan.decision === 'review'
        ? 'กำลังรอการตรวจสอบจากเจ้าหน้าที่'
        : `ลงเวลาเข้าสำเร็จ${isLate ? ' (สาย)' : ''}`,
    });
  }

  // ─── V2: Face Config ─────────────────────────────────

  async getFaceConfig(orgId: number) {
    const config = await this.prisma.faceSchoolConfig.findUnique({ where: { organizationId: BigInt(orgId) } });
    return this.serialize(config ?? {
      acceptThreshold: 0.72, reviewThreshold: 0.55, minMargin: 0.08,
      minQualityScore: 0.4, minLivenessScore: 0.0, livenessMode: 'off',
      minTemplatesRequired: 8, qdrantCollection: 'face_embeddings_v1', reviewPolicy: 'manual',
    });
  }

  async updateFaceConfig(orgId: number, data: Partial<{
    acceptThreshold: number; reviewThreshold: number; minMargin: number;
    minQualityScore: number; minLivenessScore: number; livenessMode: string;
    minTemplatesRequired: number; reviewPolicy: string;
  }>) {
    const config = await this.prisma.faceSchoolConfig.upsert({
      where: { organizationId: BigInt(orgId) },
      create: { organizationId: BigInt(orgId), ...data },
      update: { ...data },
    });

    await this.prisma.faceAuditLog.create({
      data: {
        organizationId: BigInt(orgId),
        action: 'THRESHOLD_CHANGE',
        entityType: 'face_school_config',
        entityId: config.id,
        payloadJson: JSON.stringify(data),
      },
    });

    return this.serialize(config);
  }

  async getReport(orgId: number, dateFrom: string, dateTo: string) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        organizationId: BigInt(orgId),
        attendanceDate: {
          gte: new Date(dateFrom),
          lte: new Date(dateTo),
        },
      },
      include: { user: { select: { id: true, fullName: true, roleCode: true } } },
      orderBy: [{ attendanceDate: 'desc' }, { userId: 'asc' }],
    });

    return records.map((r) => this.serialize({
      id: r.id,
      user: { id: r.user.id, fullName: r.user.fullName, roleCode: r.user.roleCode },
      date: r.attendanceDate,
      status: r.status,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      geofenceValid: r.geofenceValid,
    }));
  }

  private serialize(obj: any) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return Number(obj);
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map((v) => this.serialize(v));
    if (typeof obj === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = this.serialize(v);
      }
      return out;
    }
    return obj;
  }
}
