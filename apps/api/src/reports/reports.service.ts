import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: number, academicYearId?: number) {
    const orgFilter = { organizationId: BigInt(organizationId) };
    const yearFilter = academicYearId ? { academicYearId: BigInt(academicYearId) } : {};

    const [
      totalInbound,
      byStatus,
      byUrgency,
      totalOutbound,
      outboundByStatus,
      overdue,
      registryInbound,
      registryOutbound,
    ] = await Promise.all([
      this.prisma.inboundCase.count({ where: { ...orgFilter, ...yearFilter } }),
      this.prisma.inboundCase.groupBy({
        by: ['status'],
        where: { ...orgFilter, ...yearFilter },
        _count: { id: true },
      }),
      this.prisma.inboundCase.groupBy({
        by: ['urgencyLevel'],
        where: { ...orgFilter, ...yearFilter },
        _count: { id: true },
      }),
      this.prisma.outboundDocument.count({ where: orgFilter }),
      this.prisma.outboundDocument.groupBy({
        by: ['status'],
        where: orgFilter,
        _count: { id: true },
      }),
      this.prisma.inboundCase.count({
        where: {
          ...orgFilter,
          status: { notIn: ['completed', 'archived'] },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.documentRegistry.count({
        where: { ...orgFilter, registryType: 'inbound' },
      }),
      this.prisma.documentRegistry.count({
        where: { ...orgFilter, registryType: 'outbound' },
      }),
    ]);

    return {
      inbound: {
        total: totalInbound,
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count.id])),
        byUrgency: Object.fromEntries(byUrgency.map((u) => [u.urgencyLevel, u._count.id])),
        overdue,
      },
      outbound: {
        total: totalOutbound,
        byStatus: Object.fromEntries(outboundByStatus.map((s) => [s.status, s._count.id])),
      },
      registry: {
        inbound: registryInbound,
        outbound: registryOutbound,
      },
    };
  }

  async getWorkloadByUser(organizationId: number) {
    const assignments = await this.prisma.caseAssignment.groupBy({
      by: ['assignedToUserId'],
      where: {
        inboundCase: { organizationId: BigInt(organizationId) },
        status: { notIn: ['completed'] },
      },
      _count: { id: true },
    });

    const userIds = assignments.map((a) => a.assignedToUserId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, roleCode: true, positionTitle: true },
    });

    const userMap = new Map(users.map((u) => [u.id.toString(), u]));

    return assignments
      .map((a) => {
        const user = userMap.get(a.assignedToUserId.toString());
        return {
          userId: Number(a.assignedToUserId),
          fullName: user?.fullName ?? 'ไม่ทราบ',
          roleCode: user?.roleCode,
          positionTitle: user?.positionTitle,
          activeCases: a._count.id,
        };
      })
      .sort((a, b) => b.activeCases - a.activeCases);
  }

  async getMonthlyTrend(organizationId: number, year: number) {
    // Group inbound cases by month for the given year (Buddhist era → CE)
    const ceYear = year > 2400 ? year - 543 : year;
    const start = new Date(`${ceYear}-01-01`);
    const end = new Date(`${ceYear}-12-31T23:59:59`);

    const cases = await this.prisma.inboundCase.findMany({
      where: {
        organizationId: BigInt(organizationId),
        receivedAt: { gte: start, lte: end },
      },
      select: { receivedAt: true, urgencyLevel: true },
    });

    const outbounds = await this.prisma.outboundDocument.findMany({
      where: {
        organizationId: BigInt(organizationId),
        sentAt: { gte: start, lte: end },
      },
      select: { sentAt: true },
    });

    // Build month buckets
    const months: Record<number, { inbound: number; outbound: number; urgent: number }> = {};
    for (let m = 1; m <= 12; m++) {
      months[m] = { inbound: 0, outbound: 0, urgent: 0 };
    }
    for (const c of cases) {
      const m = c.receivedAt.getMonth() + 1;
      months[m].inbound++;
      if (['urgent', 'very_urgent', 'most_urgent'].includes(c.urgencyLevel)) {
        months[m].urgent++;
      }
    }
    for (const o of outbounds) {
      if (o.sentAt) {
        const m = o.sentAt.getMonth() + 1;
        months[m].outbound++;
      }
    }

    return Object.entries(months).map(([month, data]) => ({
      month: Number(month),
      monthName: this.thaiMonthName(Number(month)),
      ...data,
    }));
  }

  private thaiMonthName(m: number): string {
    const names = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return names[m] ?? '';
  }
}
