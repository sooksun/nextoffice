import {
  Controller, Get, Post, Put, Patch, Param, Body,
  ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/create-organization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EmailService } from '../email/email.service';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly svc: OrganizationsService,
    private readonly emailService: EmailService,
  ) {}

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

  @Get(':id/smtp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get SMTP config (password masked)' })
  getSmtp(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getSmtpConfig(id);
  }

  @Put(':id/smtp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update SMTP config' })
  updateSmtp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: {
      smtpHost: string;
      smtpPort: number;
      smtpUser: string;
      smtpPass: string;
      smtpFrom: string;
      smtpSecure: boolean;
    },
  ) {
    return this.svc.updateSmtpConfig(id, dto);
  }

  @Post(':id/smtp/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test SMTP connection' })
  testSmtp(@Body() dto: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    smtpSecure: boolean;
  }) {
    return this.emailService.testConnection({
      host: dto.smtpHost,
      port: dto.smtpPort,
      user: dto.smtpUser,
      pass: dto.smtpPass,
      from: dto.smtpFrom,
      secure: dto.smtpSecure,
    });
  }
}
