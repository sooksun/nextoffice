import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getPending(orgId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.attendanceReview.findMany({
        where: { organizationId: BigInt(orgId), reviewStatus: 'pending' },
        include: {
          attendance: {
            include: {
              user: { select: { id: true, fullName: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.attendanceReview.count({
        where: { organizationId: BigInt(orgId), reviewStatus: 'pending' },
      }),
    ]);

    return {
      total,
      page,
      limit,
      items: items.map((r) => this.serialize({
        reviewId: r.id,
        attendanceId: r.attendanceId,
        reviewStatus: r.reviewStatus,
        createdAt: r.createdAt,
        attendance: {
          checkInAt: r.attendance.checkInAt,
          status: r.attendance.status,
          decision: r.attendance.decision,
          decisionReasons: r.attendance.decisionReasons?.split(','),
          top1Score: r.attendance.top1Score,
          top2Score: r.attendance.top2Score,
          scoreMargin: r.attendance.scoreMargin,
          qualityScore: r.attendance.qualityScore,
          captureImagePath: r.attendance.captureImagePath,
          user: r.attendance.user,
        },
      })),
    };
  }

  async confirm(reviewId: number, reviewerId: number, orgId: number, note?: string) {
    const review = await this._findReview(reviewId, orgId);
    const attendance = review.attendance;

    const finalUserId = attendance.top1UserId ?? attendance.userId;

    await this.prisma.$transaction([
      this.prisma.attendanceReview.update({
        where: { id: BigInt(reviewId) },
        data: {
          reviewStatus: 'confirmed',
          reviewerId: BigInt(reviewerId),
          finalUserId,
          note: note ?? null,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.attendanceRecord.update({
        where: { id: attendance.id },
        data: {
          userId: finalUserId,
          decision: 'accepted',
          status: 'checked_in',
        },
      }),
      this.prisma.faceAuditLog.create({
        data: {
          organizationId: BigInt(orgId),
          actorId: BigInt(reviewerId),
          action: 'REVIEW_CONFIRM',
          entityType: 'attendance_review',
          entityId: BigInt(reviewId),
          payloadJson: JSON.stringify({ finalUserId: finalUserId?.toString(), note }),
        },
      }),
    ]);

    return { success: true, reviewStatus: 'confirmed' };
  }

  async reject(reviewId: number, reviewerId: number, orgId: number, note?: string) {
    const review = await this._findReview(reviewId, orgId);

    await this.prisma.$transaction([
      this.prisma.attendanceReview.update({
        where: { id: BigInt(reviewId) },
        data: {
          reviewStatus: 'rejected',
          reviewerId: BigInt(reviewerId),
          note: note ?? null,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.attendanceRecord.update({
        where: { id: review.attendance.id },
        data: { decision: 'rejected', status: 'absent' },
      }),
      this.prisma.faceAuditLog.create({
        data: {
          organizationId: BigInt(orgId),
          actorId: BigInt(reviewerId),
          action: 'REVIEW_REJECT',
          entityType: 'attendance_review',
          entityId: BigInt(reviewId),
          payloadJson: JSON.stringify({ note }),
        },
      }),
    ]);

    return { success: true, reviewStatus: 'rejected' };
  }

  async reassign(reviewId: number, reviewerId: number, orgId: number, finalPersonId: number, note?: string) {
    const review = await this._findReview(reviewId, orgId);

    await this.prisma.$transaction([
      this.prisma.attendanceReview.update({
        where: { id: BigInt(reviewId) },
        data: {
          reviewStatus: 'reassigned',
          reviewerId: BigInt(reviewerId),
          finalUserId: BigInt(finalPersonId),
          note: note ?? null,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.attendanceRecord.update({
        where: { id: review.attendance.id },
        data: {
          userId: BigInt(finalPersonId),
          decision: 'accepted',
          status: 'checked_in',
        },
      }),
      this.prisma.faceAuditLog.create({
        data: {
          organizationId: BigInt(orgId),
          actorId: BigInt(reviewerId),
          action: 'REVIEW_REASSIGN',
          entityType: 'attendance_review',
          entityId: BigInt(reviewId),
          payloadJson: JSON.stringify({ finalPersonId, note }),
        },
      }),
    ]);

    return { success: true, reviewStatus: 'reassigned', finalPersonId };
  }

  private async _findReview(reviewId: number, orgId: number) {
    const review = await this.prisma.attendanceReview.findFirst({
      where: { id: BigInt(reviewId), organizationId: BigInt(orgId) },
      include: { attendance: true },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.reviewStatus !== 'pending') {
      throw new BadRequestException(`Review already ${review.reviewStatus}`);
    }
    return review;
  }

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
