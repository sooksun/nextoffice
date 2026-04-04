import { Controller, Get, Post, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly svc: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all organizations' })
  findAll() {
    return this.svc.findAll();
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

  @Get('tree')
  @ApiOperation({ summary: 'โครงสร้างลำดับชั้นหน่วยงานทั้งหมด (สพฐ. → เขต → โรงเรียน)' })
  getTree() {
    return this.svc.getTree();
  }

  @Get(':id/children')
  @ApiOperation({ summary: 'ดูหน่วยงานย่อย (เช่น โรงเรียนในเขต)' })
  getChildren(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getChildren(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create organization' })
  create(@Body() dto: CreateOrganizationDto) {
    return this.svc.create(dto);
  }
}
