import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { KnowledgeService } from '../services/knowledge.service';
import { CreateKnowledgeDto } from '../dto/create-knowledge.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('knowledge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private service: KnowledgeService) {}

  @Get()
  @ApiOperation({ summary: 'รายการฐานข้อมูลความรู้ทั้งหมด (policy + horizon)' })
  @ApiQuery({ name: 'type', required: false, enum: ['policy', 'horizon'] })
  findAll(@Query('type') type?: string) {
    return this.service.findAll(type);
  }

  @Get('stats')
  @ApiOperation({ summary: 'สถิติฐานข้อมูลความรู้ สพฐ.' })
  getStats() {
    return this.service.getStats();
  }

  @Post()
  @ApiOperation({ summary: 'เพิ่มข้อมูลความรู้ใหม่' })
  create(@Body() dto: CreateKnowledgeDto) {
    return this.service.create(dto);
  }

  @Post('seed-obec')
  @ApiOperation({ summary: 'Seed ข้อมูลนโยบาย สพฐ. เริ่มต้น (8 นโยบายหลัก)' })
  seedObec() {
    return this.service.seedObec();
  }

  @Post('seed-horizon-sources')
  @ApiOperation({ summary: 'Seed แหล่งข้อมูล Horizon สพฐ./ศธ. (5 แหล่ง)' })
  seedHorizonSources() {
    return this.service.seedHorizonSources();
  }

  @Delete(':type/:id')
  @ApiOperation({ summary: 'ลบข้อมูลความรู้' })
  delete(@Param('type') type: string, @Param('id') id: string) {
    return this.service.delete(type, +id);
  }
}
