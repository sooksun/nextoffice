import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_TRANSITIONS = {
  draft: ['pending', 'cancelled'],
  pending: ['approved', 'rejected', 'cancelled'],
  approved: [],
  rejected: [],
  cancelled: [],
};

@Injectable()
export class TravelService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, orgId: number, data: {
    travelDate: string;
    destination: string;
    purpose: string;
    departureTime?: string;
    returnTime?: string;
  }) {
    const req = await this.prisma.travelRequest.create({
      data: {
        userId: BigInt(userId),
        organizationId: BigInt(orgId),
        travelDate: new Date(data.travelDate),
        destination: data.destination,
        purpose: data.purpose,
        departureTime: data.departureTime,
        returnTime: data.returnTime,
        status: 'draft',
      },
    });
    return this.serialize(req);
  }

  async submit(requestId: number, userId: number) {
    const req = await this.findOrFail(requestId);
    if (Number(req.userId) !== userId) throw new ForbiddenException('ไม่ใช่คำขอของคุณ');
    this.validateTransition(req.status, 'pending');

    const updated = await this.prisma.travelRequest.update({
      where: { id: BigInt(requestId) },
      data: { status: 'pending', submittedAt: new Date() },
    });
    return this.serialize(updated);
  }

  async approve(requestId: number, approverId: number, note?: string) {
    const req = await this.findOrFail(requestId);
    this.validateTransition(req.status, 'approved');

    const updated = await this.prisma.travelRequest.update({
      where: { id: BigInt(requestId) },
      data: {
        status: 'approved',
        approvedByUserId: BigInt(approverId),
        approvedAt: new Date(),
      },
    });

    // Mark attendance as travel for that date
    const today = new Date(req.travelDate);
    today.setHours(0, 0, 0, 0);
    await this.prisma.attendanceRecord.upsert({
      where: {
        userId_attendanceDate: { userId: req.userId, attendanceDate: today },
      },
      create: {
        userId: req.userId,
        organizationId: req.organizationId,
        attendanceDate: today,
        status: 'travel',
        remark: `ไปราชการ: ${req.destination}`,
      },
      update: {
        status: 'travel',
        remark: `ไปราชการ: ${req.destination}`,
      },
    });

    return this.serialize(updated);
  }

  async reject(requestId: number, approverId: number, reason: string) {
    const req = await this.findOrFail(requestId);
    this.validateTransition(req.status, 'rejected');

    const updated = await this.prisma.travelRequest.update({
      where: { id: BigInt(requestId) },
      data: {
        status: 'rejected',
        approvedByUserId: BigInt(approverId),
        rejectedReason: reason,
      },
    });
    return this.serialize(updated);
  }

  async cancel(requestId: number, userId: number) {
    const req = await this.findOrFail(requestId);
    if (Number(req.userId) !== userId) throw new ForbiddenException('ไม่ใช่คำขอของคุณ');
    this.validateTransition(req.status, 'cancelled');

    const updated = await this.prisma.travelRequest.update({
      where: { id: BigInt(requestId) },
      data: { status: 'cancelled' },
    });
    return this.serialize(updated);
  }

  async getMyRequests(userId: number) {
    const requests = await this.prisma.travelRequest.findMany({
      where: { userId: BigInt(userId) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return requests.map((r) => this.serialize(r));
  }

  async getPendingApprovals(orgId: number) {
    const requests = await this.prisma.travelRequest.findMany({
      where: { organizationId: BigInt(orgId), status: 'pending' },
      orderBy: { submittedAt: 'asc' },
      include: { user: { select: { id: true, fullName: true, roleCode: true } } },
    });
    return requests.map((r) => this.serialize(r));
  }

  async getById(requestId: number) {
    const req = await this.prisma.travelRequest.findUnique({
      where: { id: BigInt(requestId) },
      include: {
        user: { select: { id: true, fullName: true, roleCode: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!req) throw new NotFoundException('ไม่พบคำขอไปราชการ');
    return this.serialize(req);
  }

  private async findOrFail(requestId: number) {
    const req = await this.prisma.travelRequest.findUnique({
      where: { id: BigInt(requestId) },
    });
    if (!req) throw new NotFoundException('ไม่พบคำขอไปราชการ');
    return req;
  }

  private validateTransition(currentStatus: string, newStatus: string) {
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`ไม่สามารถเปลี่ยนสถานะจาก "${currentStatus}" เป็น "${newStatus}" ได้`);
    }
  }

  private serialize(obj: any) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return Number(obj);
    if (obj instanceof Date) return obj.toISOString();
    if (typeof obj === 'object' && obj.constructor?.name === 'Decimal') return Number(obj);
    if (Array.isArray(obj)) return obj.map((v) => this.serialize(v));
    if (typeof obj === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) out[k] = this.serialize(v);
      return out;
    }
    return obj;
  }
}
