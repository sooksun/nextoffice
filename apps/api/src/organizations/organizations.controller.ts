import {
  Controller, Get, Post, Patch, Param, Body,
  ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/create-organization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly svc: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all organizations (incl. parent org + active year)' })
  findAll() {
    return this.svc.findAll();
  }

  @Get('tree')
  @ApiOperation({ summary: 'โครงสร้างลำดับชั้น: เขตพื้นที่ → โรงเรียน' })
  getTree() {
    return this.svc.getTree();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/context')
  @ApiOperation({ summary: 'Get organization context (profile + scores)' })
  getContext(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getContext(id);
  }

  @Get(':id/children')
  @ApiOperation({ summary: 'ดูหน่วยงานย่อย (โรงเรียนในเขต)' })
  getChildren(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getChildren(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create organization (ADMIN only)' })
  create(@Body() dto: CreateOrganizationDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update organization (ADMIN only)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Post(':id/active-year')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'กำหนดปีสารบรรณที่ใช้งานอยู่สำหรับหน่วยงาน (ADMIN only)' })
  setActiveYear(
    @Param('id', ParseIntPipe) id: number,
    @Body('academicYearId', ParseIntPipe) academicYearId: number,
  ) {
    return this.svc.setActiveYear(id, academicYearId);
  }
}
