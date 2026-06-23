import { BadRequestException, Controller, ForbiddenException, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ResetYearService } from './services/reset-year.service';
import { DemoDataService } from './services/demo-data.service';
import { NewAcademicYearDto, SeedDemoDto } from './dto/admin-actions.dto';

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

  private getSessionOrgId(user: any): number {
    const orgId = Number(user?.organizationId);
    if (!Number.isFinite(orgId) || orgId <= 0) {
      throw new ForbiddenException('Admin action requires an organization-scoped account');
    }
    return orgId;
  }

  private assertNoCrossOrgRequest(requestedOrgId: number | undefined, sessionOrgId: number) {
    if (requestedOrgId !== undefined && Number(requestedOrgId) !== sessionOrgId) {
      throw new BadRequestException('organizationId must match the current user organization');
    }
  }

  @Post('new-academic-year')
  @ApiOperation({ summary: 'เริ่มปีการศึกษาใหม่ — สร้าง AcademicYear ใหม่ + ล้าง transaction data ของ org' })
  newAcademicYear(
    @CurrentUser() user: any,
    @Body() dto: NewAcademicYearDto,
  ) {
    const organizationId = this.getSessionOrgId(user);
    this.assertNoCrossOrgRequest(dto.organizationId, organizationId);
    return this.resetYear.execute({ ...dto, organizationId });
  }

  @Post('seed-demo')
  @ApiOperation({ summary: 'สร้าง demo data ตัวอย่าง workflow หนังสือทุกขั้นตอน สำหรับทดสอบระบบ' })
  seedDemo(@CurrentUser() user: any, @Body() dto: SeedDemoDto) {
    const organizationId = this.getSessionOrgId(user);
    this.assertNoCrossOrgRequest(dto.organizationId, organizationId);
    return this.demoData.execute(organizationId);
  }
}
