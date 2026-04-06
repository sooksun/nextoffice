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

  // ─── V2: Processing Times ─────────────────

  async getProcessingTimes(organizationId: number) {
    const stages = [
      { stage: 'new→registered', from: 'new', to: 'registered', fromAction: null, toAction: 'register' },
      { stage: 'registered→assigned', from: 'registered', to: 'assigned', fromAction: 'register', toAction: 'assign' },
      { stage: 'assigned→in_progress', from: 'assigned', to: 'in_progress', fromAction: 'assign', toAction: 'update_status' },
      { stage: 'in_progress→completed', from: 'in_progress', to: 'completed', fromAction: 'update_status', toAction: 'complete' },
    ];

    const orgId = BigInt(organizationId);
    const results = [];

    for (const s of stages) {
      const cases = await this.prisma.inboundCase.findMany({
        where: { organizationId: orgId },
        select: { id: true },
      });
      const caseIds = cases.map((c) => c.id);
      if (caseIds.length === 0) {
        results.push({ stage: s.stage, avgDays: 0, medianDays: 0, caseCount: 0 });
        continue;
      }

      // Get activities for start and end of each stage
      const activities = await this.prisma.caseActivity.findMany({
        where: {
          inboundCaseId: { in: caseIds },
          action: { in: [s.fromAction, s.toAction].filter(Boolean) as string[] },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Group by caseId and compute durations
      const caseMap = new Map<string, { from?: Date; to?: Date }>();
      for (const a of activities) {
        const key = a.inboundCaseId.toString();
        if (!caseMap.has(key)) caseMap.set(key, {});
        const entry = caseMap.get(key)!;
        if (s.fromAction && a.action === s.fromAction && !entry.from) entry.from = a.createdAt;
        if (a.action === s.toAction && !entry.to) entry.to = a.createdAt;
      }

      // For the first stage (new→registered), use case createdAt as the "from" time
      if (!s.fromAction) {
        const casesWithDate = await this.prisma.inboundCase.findMany({
          where: { id: { in: caseIds } },
          select: { id: true, createdAt: true },
        });
        for (const c of casesWithDate) {
          const key = c.id.toString();
          if (!caseMap.has(key)) caseMap.set(key, {});
          caseMap.get(key)!.from = c.createdAt;
        }
      }

      const durations: number[] = [];
      for (const [, entry] of caseMap) {
        if (entry.from && entry.to) {
          const days = (entry.to.getTime() - entry.from.getTime()) / (1000 * 60 * 60 * 24);
          durations.push(days);
        }
      }

      if (durations.length === 0) {
        results.push({ stage: s.stage, avgDays: 0, medianDays: 0, caseCount: 0 });
        continue;
      }

      durations.sort((a, b) => a - b);
      const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const mid = Math.floor(durations.length / 2);
      const median = durations.length % 2 === 0
        ? (durations[mid - 1] + durations[mid]) / 2
        : durations[mid];

      results.push({
        stage: s.stage,
        avgDays: Math.round(avg * 100) / 100,
        medianDays: Math.round(median * 100) / 100,
        caseCount: durations.length,
      });
    }

    return results;
  }

  // ─── V2: Bottlenecks ─────────────────

  async getBottlenecks(organizationId: number) {
    const nonTerminalStatuses = ['new', 'analyzing', 'proposed', 'registered', 'assigned', 'in_progress'];
    const orgId = BigInt(organizationId);
    const now = new Date();
    const results = [];

    for (const status of nonTerminalStatuses) {
      const cases = await this.prisma.inboundCase.findMany({
        where: { organizationId: orgId, status },
        orderBy: { updatedAt: 'asc' },
        select: { id: true, title: true, updatedAt: true },
      });

      if (cases.length === 0) continue;

      const daysInStatus = cases.map((c) =>
        (now.getTime() - c.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      const avgDays = daysInStatus.reduce((sum, d) => sum + d, 0) / daysInStatus.length;
      const oldest = cases[0]; // already sorted by updatedAt asc
      const oldestDays = (now.getTime() - oldest.updatedAt.getTime()) / (1000 * 60 * 60 * 24);

      results.push({
        status,
        count: cases.length,
        avgDaysInStatus: Math.round(avgDays * 100) / 100,
        oldestCase: {
          id: Number(oldest.id),
          title: oldest.title,
          daysInStatus: Math.round(oldestDays * 100) / 100,
        },
      });
    }

    return results.sort((a, b) => b.avgDaysInStatus - a.avgDaysInStatus);
  }

  // ─── V2: KPI Dashboard ─────────────────

  async getKpi(organizationId: number) {
    const orgId = BigInt(organizationId);
    const now = new Date();

    // Avg time to register (from createdAt to registeredAt)
    const registeredCases = await this.prisma.inboundCase.findMany({
      where: { organizationId: orgId, registeredAt: { not: null } },
      select: { createdAt: true, registeredAt: true },
    });
    const regDurations = registeredCases
      .filter((c) => c.registeredAt)
      .map((c) => (c.registeredAt!.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const avgTimeToRegister = regDurations.length > 0
      ? Math.round((regDurations.reduce((s, d) => s + d, 0) / regDurations.length) * 100) / 100
      : 0;

    // Avg time to complete
    const completedCases = await this.prisma.inboundCase.findMany({
      where: { organizationId: orgId, status: { in: ['completed', 'archived'] } },
      select: { createdAt: true, updatedAt: true },
    });
    const compDurations = completedCases.map(
      (c) => (c.updatedAt.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const avgTimeToComplete = compDurations.length > 0
      ? Math.round((compDurations.reduce((s, d) => s + d, 0) / compDurations.length) * 100) / 100
      : 0;

    // Completion rate
    const totalCases = await this.prisma.inboundCase.count({ where: { organizationId: orgId } });
    const completedCount = completedCases.length;
    const completionRate = totalCases > 0
      ? Math.round((completedCount / totalCases) * 10000) / 100
      : 0;

    // Overdue rate
    const overdueCount = await this.prisma.inboundCase.count({
      where: {
        organizationId: orgId,
        status: { notIn: ['completed', 'archived'] },
        dueDate: { lt: now },
      },
    });
    const activeCases = await this.prisma.inboundCase.count({
      where: { organizationId: orgId, status: { notIn: ['completed', 'archived'] } },
    });
    const overdueRate = activeCases > 0
      ? Math.round((overdueCount / activeCases) * 10000) / 100
      : 0;

    // Cases by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const recentCases = await this.prisma.inboundCase.findMany({
      where: { organizationId: orgId, createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    });
    const casesByMonth: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();
      const count = recentCases.filter((c) => {
        return c.createdAt.getFullYear() === year && c.createdAt.getMonth() === month;
      }).length;
      casesByMonth.push({
        month: `${this.thaiMonthName(month + 1)} ${year + 543}`,
        count,
      });
    }

    // Top bottleneck
    const bottlenecks = await this.getBottlenecks(organizationId);
    const topBottleneck = bottlenecks.length > 0
      ? { status: bottlenecks[0].status, count: bottlenecks[0].count, avgDays: bottlenecks[0].avgDaysInStatus }
      : null;

    return {
      avgTimeToRegister,
      avgTimeToComplete,
      completionRate,
      overdueRate,
      casesByMonth,
      topBottleneck,
    };
  }

  // ─── V2 Phase 4: District Summary ─────────────────

  async getDistrictSummary(parentOrgId: number) {
    const children = await this.prisma.organization.findMany({
      where: { parentOrganizationId: BigInt(parentOrgId), isActive: true },
      select: { id: true, name: true, shortName: true },
    });

    const results = [];
    for (const child of children) {
      const [totalCases, completedCases, pendingCases, overdueCases] = await Promise.all([
        this.prisma.inboundCase.count({ where: { organizationId: child.id } }),
        this.prisma.inboundCase.count({ where: { organizationId: child.id, status: 'completed' } }),
        this.prisma.inboundCase.count({
          where: { organizationId: child.id, status: { notIn: ['completed', 'archived'] } },
        }),
        this.prisma.inboundCase.count({
          where: {
            organizationId: child.id,
            dueDate: { lt: new Date() },
            status: { notIn: ['completed', 'archived'] },
          },
        }),
      ]);

      results.push({
        organizationId: Number(child.id),
        name: child.name,
        shortName: child.shortName,
        totalCases,
        completedCases,
        pendingCases,
        overdueCases,
        completionRate: totalCases > 0 ? Math.round((completedCases / totalCases) * 100) : 0,
      });
    }

    const totals = {
      schoolCount: children.length,
      totalCases: results.reduce((s, r) => s + r.totalCases, 0),
      completedCases: results.reduce((s, r) => s + r.completedCases, 0),
      pendingCases: results.reduce((s, r) => s + r.pendingCases, 0),
      overdueCases: results.reduce((s, r) => s + r.overdueCases, 0),
      completionRate: 0,
    };
    totals.completionRate = totals.totalCases > 0
      ? Math.round((totals.completedCases / totals.totalCases) * 100)
      : 0;

    return { totals, schools: results.sort((a, b) => b.pendingCases - a.pendingCases) };
  }

  private thaiMonthName(m: number): string {
    const names = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return names[m] ?? '';
  }
}
