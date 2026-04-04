import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AcademicYearsService } from '../services/academic-years.service';
import { CreateAcademicYearDto } from '../dto/create-academic-year.dto';

@ApiTags('academic-years')
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
  @ApiOperation({ summary: 'สร้างปีการศึกษาใหม่' })
  create(@Body() dto: CreateAcademicYearDto) {
    return this.service.create(dto);
  }

  @Put(':id/set-current')
  @ApiOperation({ summary: 'ตั้งเป็นปีการศึกษาปัจจุบัน' })
  setCurrent(@Param('id') id: string) {
    return this.service.setCurrent(+id);
  }
}
