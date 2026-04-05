import { Controller, Get, Post, Patch, Param, Query, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { CasesService } from '../services/cases.service';
import { CaseWorkflowService } from '../services/case-workflow.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('cases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cases')
export class CasesController {
  constructor(
    private readonly svc: CasesService,
    private readonly workflow: CaseWorkflowService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all cases' })
  @ApiQuery({ name: 'organizationId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false })
  listCases(@Query('organizationId') orgId?: string, @Query('status') status?: string) {
    return this.svc.listCases(orgId ? Number(orgId) : undefined, status);
  }

  @Post('from-intake/:documentIntakeId')
  @ApiOperation({ summary: 'Create case from a classified document intake' })
  createFromIntake(@Param('documentIntakeId', ParseIntPipe) documentIntakeId: number) {
    return this.svc.createFromIntake(documentIntakeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get case by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Get(':id/options')
  @ApiOperation({ summary: 'Get AI-generated options for a case' })
  getOptions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getOptions(id);
  }

  // ─── Workflow endpoints ───

  @Post(':id/register')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'CLERK', 'DIRECTOR', 'VICE_DIRECTOR')
  @ApiOperation({ summary: 'ลงทะเบียนรับหนังสือ (ได้เลขรับอัตโนมัติ)' })
  register(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.workflow.register(id, Number(user.id));
  }

  @Post(':id/assign')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR')
  @ApiOperation({ summary: 'มอบหมายงาน (ผอ./รอง ผอ.)' })
  assign(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: {
      assignments: { userId: number; role?: string; dueDate?: string; note?: string }[];
      directorNote?: string;
      selectedOptionId?: number;
    },
  ) {
    return this.workflow.assign(
      id,
      Number(user.id),
      body.assignments,
      body.directorNote,
      body.selectedOptionId,
    );
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'เปลี่ยนสถานะ case' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: { status: string },
  ) {
    return this.workflow.updateStatus(id, body.status, Number(user.id));
  }

  @Get(':id/assignments')
  @ApiOperation({ summary: 'ดูรายการมอบหมายงานของ case' })
  getAssignments(@Param('id', ParseIntPipe) id: number) {
    return this.workflow.getAssignments(id);
  }

  @Patch('assignments/:assignmentId/status')
  @ApiOperation({ summary: 'อัปเดตสถานะงานที่ได้รับมอบหมาย' })
  updateAssignmentStatus(
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @CurrentUser() user: any,
    @Body() body: { status: string },
  ) {
    return this.workflow.updateAssignmentStatus(assignmentId, body.status, Number(user.id));
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'ดู activity log ของ case' })
  getActivities(@Param('id', ParseIntPipe) id: number) {
    return this.workflow.getActivities(id);
  }
}
