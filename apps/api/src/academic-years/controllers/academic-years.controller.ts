import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AcademicYearsService } from '../services/academic-years.service';
import { CreateAcademicYearDto } from '../dto/create-academic-year.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('academic-years')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('academic-years')
export class AcademicYearsController {
  constructor(private service: AcademicYearsService) {}

  @Get()
  @ApiOperation({ summary: 'รายการปีการศึกษาทั้งหมด' })
  findAll() {
    return this.service.findAll();
  }

  @Get('current')
  @ApiOperation({ summary: 'ปีการศึกษาปัจจุบัน' })
  findCurrent() {
    return this.service.findCurrent();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'สร้างปีการศึกษาใหม่ (ADMIN only)' })
  create(@Body() dto: CreateAcademicYearDto) {
    return this.service.create(dto);
  }

  @Put(':id/set-current')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'ตั้งเป็นปีการศึกษาปัจจุบัน (ADMIN only)' })
  setCurrent(@Param('id') id: string) {
    return this.service.setCurrent(+id);
  }
}
