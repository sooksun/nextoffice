import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_TRANSITIONS = {
  draft: ['pending', 'cancelled'],
  pending: ['approved', 'rejected', 'cancelled'],
  approved: [],
  rejected: [],
  cancelled: [],
};

const LEAVE_TYPE_LABEL: Record<string, string> = {
  sick: 'ลาป่วย',
  personal: 'ลากิจ',
  vacation: 'ลาพักผ่อน',
  maternity: 'ลาคลอด',
  ordination: 'ลาบวช',
  training: 'ลาศึกษาต่อ',
};

// Default annual leave allowances (Thai government teacher)
const DEFAULT_BALANCE: Record<string, number> = {
  sick: 60,
  personal: 45,
  vacation: 10,
};

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Create Leave Request ───────────────────────────

  async create(userId: number, orgId: number, data: {
    leaveType: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    reason?: string;
    contactPhone?: string;
  }) {
    const req = await this.prisma.leaveRequest.create({
      data: {
        userId: BigInt(userId),
        organizationId: BigInt(orgId),
        leaveType: data.leaveType,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        totalDays: data.totalDays,
        reason: data.reason,
        contactPhone: data.contactPhone,
        status: 'draft',
      },
    });

    return this.serialize(req);
  }

  // ─── Submit for Approval ────────────────────────────

  async submit(requestId: number, userId: number) {
    const req = await this.prisma.leaveRequest.findUnique({
      where: { id: BigInt(requestId) },
    });
    if (!req) throw new NotFoundException('ไม่พบคำขอลา');
    if (Number(req.userId) !== userId) throw new ForbiddenException('ไม่ใช่คำขอของคุณ');
    this.validateTransition(req.status, 'pending');

    // Find approver based on organization's approval chain
    const approver = await this.resolveApprover(Number(req.organizationId), userId, 'leave');

    const updated = await this.prisma.leaveRequest.update({
      where: { id: BigInt(requestId) },
      data: {
        status: 'pending',
        submittedAt: new Date(),
        currentApproverUserId: approver ? BigInt(approver.id) : null,
      },
    });

    return this.serialize(updated);
  }

  // ─── Approve ────────────────────────────────────────

  async approve(requestId: number, approverId: number, note?: string) {
    const req = await this.prisma.leaveRequest.findUnique({
      where: { id: BigInt(requestId) },
    });
    if (!req) throw new NotFoundException('ไม่พบคำขอลา');
    this.validateTransition(req.status, 'approved');

    const updated = await this.prisma.leaveRequest.update({
      where: { id: BigInt(requestId) },
      data: {
        status: 'approved',
        approvedByUserId: BigInt(approverId),
        approvedAt: new Date(),
        rejectedReason: note || null,
      },
    });

    // Deduct from leave balance
    await this.deductBalance(Number(req.userId), req.leaveType, Number(req.totalDays));

    return this.serialize(updated);
  }

  // ─── Reject ─────────────────────────────────────────

  async reject(requestId: number, approverId: number, reason: string) {
    const req = await this.prisma.leaveRequest.findUnique({
      where: { id: BigInt(requestId) },
    });
    if (!req) throw new NotFoundException('ไม่พบคำขอลา');
    this.validateTransition(req.status, 'rejected');

    const updated = await this.prisma.leaveRequest.update({
      where: { id: BigInt(requestId) },
      data: {
        status: 'rejected',
        approvedByUserId: BigInt(approverId),
        rejectedReason: reason,
      },
    });

    return this.serialize(updated);
  }

  // ─── Cancel ─────────────────────────────────────────

  async cancel(requestId: number, userId: number) {
    const req = await this.prisma.leaveRequest.findUnique({
      where: { id: BigInt(requestId) },
    });
    if (!req) throw new NotFoundException('ไม่พบคำขอลา');
    if (Number(req.userId) !== userId) throw new ForbiddenException('ไม่ใช่คำขอของคุณ');
    this.validateTransition(req.status, 'cancelled');

    const updated = await this.prisma.leaveRequest.update({
      where: { id: BigInt(requestId) },
      data: { status: 'cancelled' },
    });

    return this.serialize(updated);
  }

  // ─── Queries ────────────────────────────────────────

  async getMyRequests(userId: number) {
    const requests = await this.prisma.leaveRequest.findMany({
      where: { userId: BigInt(userId) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { approvedBy: { select: { fullName: true } } },
    });
    return requests.map((r) => this.serialize(r));
  }

  async getPendingApprovals(approverId: number, orgId: number) {
    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        organizationId: BigInt(orgId),
        status: 'pending',
      },
      orderBy: { submittedAt: 'asc' },
      include: {
        user: { select: { id: true, fullName: true, roleCode: true, positionTitle: true } },
      },
    });
    return requests.map((r) => this.serialize(r));
  }

  async getById(requestId: number) {
    const req = await this.prisma.leaveRequest.findUnique({
      where: { id: BigInt(requestId) },
      include: {
        user: { select: { id: true, fullName: true, roleCode: true, positionTitle: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!req) throw new NotFoundException('ไม่พบคำขอลา');
    return this.serialize(req);
  }

  // ─── Leave Balance ──────────────────────────────────

  async getBalance(userId: number) {
    const currentYear = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true },
    });
    if (!currentYear) return [];

    // Ensure balances exist
    await this.ensureBalances(userId, Number(currentYear.id));

    const balances = await this.prisma.leaveBalance.findMany({
      where: { userId: BigInt(userId), academicYearId: currentYear.id },
    });

    return balances.map((b) => ({
      leaveType: b.leaveType,
      label: LEAVE_TYPE_LABEL[b.leaveType] || b.leaveType,
      totalAllowed: Number(b.totalAllowed),
      totalUsed: Number(b.totalUsed),
      remaining: Number(b.totalAllowed) - Number(b.totalUsed),
    }));
  }

  private async ensureBalances(userId: number, academicYearId: number) {
    for (const [type, allowed] of Object.entries(DEFAULT_BALANCE)) {
      await this.prisma.leaveBalance.upsert({
        where: {
          userId_academicYearId_leaveType: {
            userId: BigInt(userId),
            academicYearId: BigInt(academicYearId),
            leaveType: type,
          },
        },
        create: {
          userId: BigInt(userId),
          academicYearId: BigInt(academicYearId),
          leaveType: type,
          totalAllowed: allowed,
          totalUsed: 0,
        },
        update: {},
      });
    }
  }

  private async deductBalance(userId: number, leaveType: string, days: number) {
    const currentYear = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true },
    });
    if (!currentYear) return;

    await this.ensureBalances(userId, Number(currentYear.id));

    await this.prisma.leaveBalance.update({
      where: {
        userId_academicYearId_leaveType: {
          userId: BigInt(userId),
          academicYearId: currentYear.id,
          leaveType,
        },
      },
      data: { totalUsed: { increment: days } },
    });
  }

  // ─── Approval Chain Resolution ──────────────────────

  private async resolveApprover(orgId: number, requesterId: number, requestType: string) {
    const requester = await this.prisma.user.findUnique({
      where: { id: BigInt(requesterId) },
      select: { roleCode: true },
    });
    if (!requester) return null;

    // Check custom approval chain
    const chain = await this.prisma.approvalChainConfig.findFirst({
      where: {
        organizationId: BigInt(orgId),
        requestType,
        requesterRole: requester.roleCode,
        stepOrder: 1,
        isActive: true,
      },
    });

    const targetRole = chain?.approverRole || this.defaultApproverRole(requester.roleCode);

    // Find user with that role in the same org
    const approver = await this.prisma.user.findFirst({
      where: {
        organizationId: BigInt(orgId),
        roleCode: targetRole,
        isActive: true,
      },
      select: { id: true },
    });

    return approver;
  }

  private defaultApproverRole(requesterRole: string): string {
    const chain: Record<string, string> = {
      TEACHER: 'HEAD_TEACHER',
      CLERK: 'HEAD_TEACHER',
      HEAD_TEACHER: 'VICE_DIRECTOR',
      VICE_DIRECTOR: 'DIRECTOR',
      DIRECTOR: 'DIRECTOR',
    };
    return chain[requesterRole] || 'DIRECTOR';
  }

  // ─── Helpers ────────────────────────────────────────

  private validateTransition(currentStatus: string, newStatus: string) {
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `ไม่สามารถเปลี่ยนสถานะจาก "${currentStatus}" เป็น "${newStatus}" ได้`,
      );
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
      for (const [k, v] of Object.entries(obj)) {
        out[k] = this.serialize(v);
      }
      return out;
    }
    return obj;
  }
}
