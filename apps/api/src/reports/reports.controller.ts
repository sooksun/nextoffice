import { Controller, Get, Param, Query, ParseIntPipe, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly svc: ReportsService,
    private readonly prisma: PrismaService,
  ) {}

  private assertOrgAccess(user: any, organizationId: number) {
    if (user.roleCode === 'ADMIN') return;
    if (Number(user.organizationId) !== organizationId) {
      throw new ForbiddenException('ไม่สามารถเข้าถึงข้อมูลของหน่วยงานอื่น');
    }
  }

  @Get(':organizationId/summary')
  @ApiOperation({ summary: 'สรุปภาพรวม: จำนวนรับ/ส่ง, สถานะ, urgency, งานค้าง' })
  @ApiQuery({ name: 'academicYearId', required: false, type: Number })
  getSummary(
    @CurrentUser() user: any,
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('academicYearId') academicYearId?: string,
  ) {
    this.assertOrgAccess(user, organizationId);
    return this.svc.getSummary(organizationId, academicYearId ? Number(academicYearId) : undefined);
  }

  @Get(':organizationId/workload')
  @ApiOperation({ summary: 'ภาระงานรายบุคคล (งานที่ยังค้างอยู่ต่อคน)' })
  getWorkload(
    @CurrentUser() user: any,
    @Param('organizationId', ParseIntPipe) organizationId: number,
  ) {
    this.assertOrgAccess(user, organizationId);
    return this.svc.getWorkloadByUser(organizationId);
  }

  @Get(':organizationId/monthly-trend')
  @ApiOperation({ summary: 'แนวโน้มรายเดือน: รับ/ส่ง/ด่วน' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'ปีพ.ศ. เช่น 2568' })
  getMonthlyTrend(
    @CurrentUser() user: any,
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('year') year?: string,
  ) {
    this.assertOrgAccess(user, organizationId);
    const now = new Date();
    const buddhistYear = year ? Number(year) : now.getFullYear() + 543;
    return this.svc.getMonthlyTrend(organizationId, buddhistYear);
  }

  @Get(':organizationId/audit-trail')
  @ApiOperation({ summary: 'G2: Audit trail — ประวัติการเปลี่ยนแปลงทุก case ในหน่วยงาน' })
  @ApiQuery({ name: 'action', required: false, description: 'register|assign|routing_applied|update_status|complete' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  async getAuditTrail(
    @CurrentUser() user: any,
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('take') take?: string,
  ) {
    this.assertOrgAccess(user, organizationId);
    const where: any = {
      inboundCase: { organizationId: BigInt(organizationId) },
    };
    if (action) where.action = action;
    if (userId) where.userId = BigInt(userId);

    const activities = await this.prisma.caseActivity.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, roleCode: true } },
        inboundCase: { select: { id: true, title: true, registrationNo: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: take ? Number(take) : 100,
    });

    return activities.map((a) => ({
      id: Number(a.id),
      action: a.action,
      detail: a.detail ? JSON.parse(a.detail) : null,
      createdAt: a.createdAt,
      user: a.user ? { id: Number(a.user.id), fullName: a.user.fullName, roleCode: a.user.roleCode } : null,
      case: a.inboundCase ? {
        id: Number(a.inboundCase.id),
        title: a.inboundCase.title,
        registrationNo: a.inboundCase.registrationNo,
      } : null,
    }));
  }

  // ─── V2: Processing Times ─────────────────

  @Get(':organizationId/processing-times')
  @ApiOperation({ summary: 'V2: เวลาเฉลี่ยในแต่ละขั้นตอน' })
  getProcessingTimes(
    @CurrentUser() user: any,
    @Param('organizationId', ParseIntPipe) organizationId: number,
  ) {
    this.assertOrgAccess(user, organizationId);
    return this.svc.getProcessingTimes(organizationId);
  }

  // ─── V2: Bottlenecks ─────────────────

  @Get(':organizationId/bottlenecks')
  @ApiOperation({ summary: 'V2: จุดที่งานค้างนานที่สุด' })
  getBottlenecks(
    @CurrentUser() user: any,
    @Param('organizationId', ParseIntPipe) organizationId: number,
  ) {
    this.assertOrgAccess(user, organizationId);
    return this.svc.getBottlenecks(organizationId);
  }

  // ─── V2: KPI Dashboard ─────────────────

  @Get(':organizationId/kpi')
  @ApiOperation({ summary: 'V2: KPI Dashboard' })
  getKpi(
    @CurrentUser() user: any,
    @Param('organizationId', ParseIntPipe) organizationId: number,
  ) {
    this.assertOrgAccess(user, organizationId);
    return this.svc.getKpi(organizationId);
  }

  // ─── V2 Phase 4: District Summary ─────────────────

  @Get('district/:parentOrgId/summary')
  @ApiOperation({ summary: 'V2 Phase 4: สรุปภาพรวมระดับเขต (รวมทุกโรงเรียน)' })
  getDistrictSummary(
    @CurrentUser() user: any,
    @Param('parentOrgId', ParseIntPipe) parentOrgId: number,
  ) {
    // District summary: must belong to the district org OR be ADMIN
    if (user.roleCode !== 'ADMIN' && Number(user.organizationId) !== parentOrgId) {
      throw new ForbiddenException('ไม่สามารถเข้าถึงข้อมูลของเขตพื้นที่อื่น');
    }
    return this.svc.getDistrictSummary(parentOrgId);
  }

  // ─── V2: Executive Snapshot ─────────────────

  @Get(':organizationId/executive-snapshot')
  @ApiOperation({ summary: 'V2: สรุปภาพรวมประจำวันสำหรับผู้บริหาร' })
  async getExecutiveSnapshot(
    @CurrentUser() user: any,
    @Param('organizationId', ParseIntPipe) organizationId: number,
  ) {
    this.assertOrgAccess(user, organizationId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const orgId = BigInt(organizationId);

    // Today's inbound count
    const totalInbound = await this.prisma.inboundCase.count({
      where: { organizationId: orgId, createdAt: { gte: today, lt: tomorrow } },
    });

    // Urgent count
    const urgentCount = await this.prisma.inboundCase.count({
      where: {
        organizationId: orgId,
        urgencyLevel: { in: ['urgent', 'very_urgent', 'most_urgent'] },
        status: { notIn: ['completed', 'archived'] },
      },
    });

    // Pending count
    const pendingCount = await this.prisma.inboundCase.count({
      where: {
        organizationId: orgId,
        status: { in: ['new', 'analyzing', 'proposed', 'registered'] },
      },
    });

    // Overdue count
    const overdueCount = await this.prisma.inboundCase.count({
      where: {
        organizationId: orgId,
        dueDate: { lt: today },
        status: { notIn: ['completed', 'archived'] },
      },
    });

    // Recent items
    const recentCases = await this.prisma.inboundCase.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, title: true, urgencyLevel: true, status: true, createdAt: true },
    });

    const dateStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear() + 543}`;

    return {
      date: dateStr,
      totalInbound,
      urgentCount,
      pendingCount,
      overdueCount,
      recentItems: recentCases.map((c) => ({
        id: Number(c.id),
        title: c.title,
        urgency: c.urgencyLevel,
        status: c.status,
        createdAt: c.createdAt,
      })),
    };
  }
}
