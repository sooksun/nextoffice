import { Controller, Get, Post, Delete, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { WorkGroupsService } from './work-groups.service';

@ApiTags('work-groups')
@Controller('work-groups')
export class WorkGroupsController {
  constructor(private readonly svc: WorkGroupsService) {}

  @Get()
  @ApiOperation({ summary: 'List work groups (shared template or by org)' })
  @ApiQuery({ name: 'organizationId', required: false, type: Number })
  findAll(@Query('organizationId') organizationId?: string) {
    return this.svc.findAll(organizationId ? parseInt(organizationId, 10) : undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get work group with functions and staff' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get('assignments/:organizationId')
  @ApiOperation({ summary: 'Get staff assignments for an organization' })
  @ApiQuery({ name: 'academicYearId', required: false, type: Number })
  getAssignments(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.svc.getStaffAssignments(
      organizationId,
      academicYearId ? parseInt(academicYearId, 10) : undefined,
    );
  }

  @Post('assignments')
  @ApiOperation({ summary: 'Assign staff to a work function' })
  assign(@Body() dto: {
    organizationId: number;
    userId: number;
    workFunctionId: number;
    role?: string;
    academicYearId: number;
    semester?: number;
    appointmentOrderNo?: string;
  }) {
    return this.svc.assignStaff(dto);
  }

  @Delete('assignments/:id')
  @ApiOperation({ summary: 'Deactivate a staff assignment' })
  removeAssignment(@Param('id', ParseIntPipe) id: number) {
    return this.svc.removeStaffAssignment(id);
  }

  @Post('seed-template')
  @ApiOperation({ summary: 'Seed the shared 4-group + 74-function template (idempotent)' })
  seedTemplate() {
    return this.svc.seedTemplate();
  }
}
