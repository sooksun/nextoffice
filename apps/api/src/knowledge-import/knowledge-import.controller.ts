import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { KnowledgeImportService } from './knowledge-import.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('knowledge-import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('knowledge-import')
export class KnowledgeImportController {
  constructor(private readonly svc: KnowledgeImportService) {}

  @Post()
  @ApiOperation({ summary: 'นำเข้าความรู้: PDF, รูปภาพ, หรือข้อความ' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        category: { type: 'string' },
        description: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('title') title: string,
    @Body('category') category?: string,
    @Body('description') description?: string,
  ) {
    if (!user?.organizationId) {
      throw new BadRequestException('ผู้ใช้ไม่มีองค์กร กรุณาติดต่อผู้ดูแลระบบ');
    }
    if (!file && !description?.trim()) {
      throw new BadRequestException('กรุณาแนบไฟล์หรือกรอกเนื้อหาความรู้');
    }
    return this.svc.create({
      userId: Number(user.id),
      orgId: Number(user.organizationId),
      title,
      category,
      description,
      file,
    });
  }

  @Get()
  @ApiOperation({ summary: 'รายการความรู้ขององค์กร' })
  findAll(@CurrentUser() user: any) {
    return this.svc.findAll(Number(user.organizationId));
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'ลองนำเข้าใหม่ (retry)' })
  retry(@Param('id', ParseIntPipe) id: number) {
    return this.svc.retry(id);
  }

  @Post('reset-stuck')
  @ApiOperation({ summary: 'รีเซ็ตรายการที่ค้างนานเกิน 30 นาที' })
  resetStuck() {
    return this.svc.resetStuckItems();
  }

  @Get(':id')
  @ApiOperation({ summary: 'รายละเอียดความรู้' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }
}
