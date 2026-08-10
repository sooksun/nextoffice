import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
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

    // Only the FIRST occurrence of each (case, action) is ever used below, so
    // collapse to MIN() in SQL. Previously this loaded every case row plus every
    // matching activity row for the org into Node — unbounded as history grows.
    const actions = Array.from(
      new Set(stages.flatMap((s) => [s.fromAction, s.toAction].filter(Boolean) as string[])),
    );
    const rows = await this.prisma.$queryRaw<
      { case_id: bigint; action: string; first_at: Date; case_created_at: Date }[]
    >`
      SELECT a.inbound_case_id AS case_id,
             a.action          AS action,
             MIN(a.created_at) AS first_at,
             c.created_at      AS case_created_at
      FROM case_activities a
      JOIN inbound_cases c ON c.id = a.inbound_case_id
      WHERE c.organization_id = ${orgId}
        AND a.action IN (${Prisma.join(actions)})
      GROUP BY a.inbound_case_id, a.action, c.created_at
    `;

    if (rows.length === 0) {
      return stages.map((s) => ({ stage: s.stage, avgDays: 0, medianDays: 0, caseCount: 0 }));
    }

    const activities = rows.map((r) => ({
      inboundCaseId: r.case_id,
      action: r.action,
      createdAt: new Date(r.first_at),
    }));
    // Distinct case createdAt, used as the "from" time of the first stage.
    const cases = Array.from(
      new Map(rows.map((r) => [r.case_id.toString(), {
        id: r.case_id,
        createdAt: new Date(r.case_created_at),
      }])).values(),
    );

    for (const s of stages) {
      const stageActions = new Set([s.fromAction, s.toAction].filter(Boolean) as string[]);

      // Group by caseId and compute durations
      const caseMap = new Map<string, { from?: Date; to?: Date }>();
      for (const a of activities) {
        if (!stageActions.has(a.action)) continue;
        const key = a.inboundCaseId.toString();
        if (!caseMap.has(key)) caseMap.set(key, {});
        const entry = caseMap.get(key)!;
        if (s.fromAction && a.action === s.fromAction && !entry.from) entry.from = a.createdAt;
        if (a.action === s.toAction && !entry.to) entry.to = a.createdAt;
      }

      // For the first stage (new→registered), use case createdAt as the "from" time
      if (!s.fromAction) {
        for (const c of cases) {
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

    // Single query for all non-terminal statuses; group in memory.
    // Global `updatedAt asc` order is preserved within each status bucket.
    const cases = await this.prisma.inboundCase.findMany({
      where: { organizationId: orgId, status: { in: nonTerminalStatuses } },
      orderBy: { updatedAt: 'asc' },
      select: { id: true, title: true, updatedAt: true, status: true },
    });

    const byStatus = new Map<string, typeof cases>();
    for (const c of cases) {
      const group = byStatus.get(c.status);
      if (group) group.push(c);
      else byStatus.set(c.status, [c]);
    }

    for (const status of nonTerminalStatuses) {
      const group = byStatus.get(status);
      if (!group || group.length === 0) continue;

      const daysInStatus = group.map((c) =>
        (now.getTime() - c.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      const avgDays = daysInStatus.reduce((sum, d) => sum + d, 0) / daysInStatus.length;
      const oldest = group[0]; // already sorted by updatedAt asc
      const oldestDays = (now.getTime() - oldest.updatedAt.getTime()) / (1000 * 60 * 60 * 24);

      results.push({
        status,
        count: group.length,
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

    // Averages are computed in SQL: pulling every case row into Node just to
    // average two date deltas grew linearly with the org's whole history.
    const [durations] = await this.prisma.$queryRaw<
      { avg_register_sec: number | null; avg_complete_sec: number | null; completed_count: bigint }[]
    >`
      SELECT
        AVG(CASE WHEN registered_at IS NOT NULL
                 THEN TIMESTAMPDIFF(SECOND, created_at, registered_at) END) AS avg_register_sec,
        AVG(CASE WHEN status IN ('completed', 'archived')
                 THEN TIMESTAMPDIFF(SECOND, created_at, updated_at) END)    AS avg_complete_sec,
        SUM(CASE WHEN status IN ('completed', 'archived') THEN 1 ELSE 0 END) AS completed_count
      FROM inbound_cases
      WHERE organization_id = ${orgId}
    `;

    const secToDays = (sec: number | null | undefined) =>
      sec == null ? 0 : Math.round((Number(sec) / 86400) * 100) / 100;
    const avgTimeToRegister = secToDays(durations?.avg_register_sec);
    const avgTimeToComplete = secToDays(durations?.avg_complete_sec);

    // Completion rate
    const totalCases = await this.prisma.inboundCase.count({ where: { organizationId: orgId } });
    const completedCount = Number(durations?.completed_count ?? 0);
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

    const childIds = children.map((c) => c.id);
    const now = new Date();

    // Two grouped queries cover all schools instead of 4 counts per school.
    const [byOrgStatus, overdueByOrg] = childIds.length === 0
      ? [[], []]
      : await Promise.all([
          this.prisma.inboundCase.groupBy({
            by: ['organizationId', 'status'],
            where: { organizationId: { in: childIds } },
            _count: { id: true },
          }),
          this.prisma.inboundCase.groupBy({
            by: ['organizationId'],
            where: {
              organizationId: { in: childIds },
              dueDate: { lt: now },
              status: { notIn: ['completed', 'archived'] },
            },
            _count: { id: true },
          }),
        ]);

    const statMap = new Map<string, { total: number; completed: number; pending: number; overdue: number }>();
    for (const id of childIds) {
      statMap.set(id.toString(), { total: 0, completed: 0, pending: 0, overdue: 0 });
    }
    for (const row of byOrgStatus) {
      const stat = statMap.get(row.organizationId.toString());
      if (!stat) continue;
      const count = row._count.id;
      stat.total += count;
      if (row.status === 'completed') stat.completed += count;
      if (!['completed', 'archived'].includes(row.status)) stat.pending += count;
    }
    for (const row of overdueByOrg) {
      const stat = statMap.get(row.organizationId.toString());
      if (stat) stat.overdue = row._count.id;
    }

    const results = children.map((child) => {
      const stat = statMap.get(child.id.toString())!;
      return {
        organizationId: Number(child.id),
        name: child.name,
        shortName: child.shortName,
        totalCases: stat.total,
        completedCases: stat.completed,
        pendingCases: stat.pending,
        overdueCases: stat.overdue,
        completionRate: stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0,
      };
    });

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
