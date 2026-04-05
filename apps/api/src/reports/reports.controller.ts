import { Controller, Get, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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

  @Get(':organizationId/summary')
  @ApiOperation({ summary: 'สรุปภาพรวม: จำนวนรับ/ส่ง, สถานะ, urgency, งานค้าง' })
  @ApiQuery({ name: 'academicYearId', required: false, type: Number })
  getSummary(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.svc.getSummary(organizationId, academicYearId ? Number(academicYearId) : undefined);
  }

  @Get(':organizationId/workload')
  @ApiOperation({ summary: 'ภาระงานรายบุคคล (งานที่ยังค้างอยู่ต่อคน)' })
  getWorkload(@Param('organizationId', ParseIntPipe) organizationId: number) {
    return this.svc.getWorkloadByUser(organizationId);
  }

  @Get(':organizationId/monthly-trend')
  @ApiOperation({ summary: 'แนวโน้มรายเดือน: รับ/ส่ง/ด่วน' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'ปีพ.ศ. เช่น 2568' })
  getMonthlyTrend(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('year') year?: string,
  ) {
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
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('take') take?: string,
  ) {
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
}
