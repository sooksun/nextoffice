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

  async registerFace(userId: number, orgId: number, imageBase64: string) {
    const result = await this.faceClient.registerFace(userId, imageBase64);
    if (!result.success) {
      throw new BadRequestException(result.message);
    }

    // Revoke any existing active registration
    await this.prisma.faceRegistration.updateMany({
      where: { userId: BigInt(userId), status: 'active' },
      data: { status: 'revoked', revokedAt: new Date() },
    });

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

    // Determine if late (after 08:30)
    const now = new Date();
    const isLate = now.getHours() > 8 || (now.getHours() === 8 && now.getMinutes() > 30);

    const record = existing
      ? await this.prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            checkInAt: now,
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

    const now = new Date();
    const record = await this.prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        checkOutAt: now,
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
      message: 'ลงเวลาออกสำเร็จ',
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
