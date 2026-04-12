import { Controller, Get, Post, Delete, Param, Body, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { WorkGroupsService } from './work-groups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('work-groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('work-groups')
export class WorkGroupsController {
  constructor(private readonly svc: WorkGroupsService) {}

  @Get()
  @ApiOperation({ summary: 'List work groups for current organization' })
  findAll(@CurrentUser() user: any) {
    return this.svc.findAll(Number(user.organizationId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get work group with functions and staff' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get('assignments/my-org')
  @ApiOperation({ summary: 'Get staff assignments for current organization' })
  @ApiQuery({ name: 'academicYearId', required: false, type: Number })
  getAssignments(
    @CurrentUser() user: any,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.svc.getStaffAssignments(
      Number(user.organizationId),
      academicYearId ? parseInt(academicYearId, 10) : undefined,
    );
  }

  @Post('assignments')
  @ApiOperation({ summary: 'Assign staff to a work function' })
  assign(
    @CurrentUser() user: any,
    @Body() dto: {
      userId: number;
      workFunctionId: number;
      role?: string;
      academicYearId: number;
      semester?: number;
      appointmentOrderNo?: string;
    },
  ) {
    return this.svc.assignStaff({
      ...dto,
      organizationId: Number(user.organizationId),
    });
  }

  @Delete('assignments/:id')
  @ApiOperation({ summary: 'Deactivate a staff assignment' })
  removeAssignment(@Param('id', ParseIntPipe) id: number) {
    return this.svc.removeStaffAssignment(id);
  }

  @Post('seed-template')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Seed the shared 4-group + 74-function template (idempotent, ADMIN only)' })
  seedTemplate() {
    return this.svc.seedTemplate();
  }
}
