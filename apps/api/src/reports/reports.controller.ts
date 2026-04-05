import { Controller, Get, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

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
}
