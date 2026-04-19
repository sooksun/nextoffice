import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ResetYearService } from './services/reset-year.service';
import { DemoDataService } from './services/demo-data.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly resetYear: ResetYearService,
    private readonly demoData: DemoDataService,
  ) {}

  @Post('new-academic-year')
  @ApiOperation({ summary: 'เริ่มปีการศึกษาใหม่ — สร้าง AcademicYear ใหม่ + ล้าง transaction data ของ org' })
  newAcademicYear(
    @Body() dto: {
      organizationId: number;
      year: number;
      yearName?: string;
      startDate: string;
      endDate: string;
    },
  ) {
    return this.resetYear.execute(dto);
  }

  @Post('seed-demo')
  @ApiOperation({ summary: 'สร้าง demo data ตัวอย่าง workflow หนังสือทุกขั้นตอน สำหรับทดสอบระบบ' })
  seedDemo(@Body() dto: { organizationId: number }) {
    return this.demoData.execute(dto.organizationId);
  }
}
