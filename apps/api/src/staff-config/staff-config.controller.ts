import {
  Controller, Get, Patch, Post, Delete,
  Param, Body, UploadedFile,
  UseGuards, UseInterceptors,
  ParseIntPipe, Res, HttpCode,
} from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { StaffConfigService } from './staff-config.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('staff-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('staff-config')
export class StaffConfigController {
  constructor(private readonly svc: StaffConfigService) {}

  @Get()
  @ApiOperation({ summary: 'รายชื่อ DIRECTOR / VICE_DIRECTOR / CLERK ขององค์กร' })
  listStaff(@CurrentUser() user: any) {
    return this.svc.listStaff(Number(user.organizationId));
  }

  @Get('line-status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: 'รายชื่อบุคลากรพร้อมสถานะ LINE' })
  listLineStatus(@CurrentUser() user: any) {
    return this.svc.listUsersWithLineStatus(Number(user.organizationId));
  }

  @Post(':id/line-unlink')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @HttpCode(200)
  @ApiOperation({ summary: 'ยกเลิกการเชื่อมต่อ LINE ของ user' })
  unlinkLine(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.svc.unlinkLine(id, Number(user.organizationId));
  }

  @Patch(':id/position')
  @ApiOperation({ summary: 'อัปเดตตำแหน่ง (positionTitle)' })
  updatePosition(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body('positionTitle') positionTitle: string,
  ) {
    return this.svc.updatePosition(id, Number(user.organizationId), positionTitle ?? '');
  }

  @Post(':id/signature')
  @ApiOperation({ summary: 'อัปโหลดรูปลายเซ็น (PNG/JPEG/WebP, max 2 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadSignature(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.uploadSignature(id, Number(user.organizationId), file);
  }

  @Delete(':id/signature')
  @HttpCode(200)
  @ApiOperation({ summary: 'ลบรูปลายเซ็น' })
  deleteSignature(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.svc.deleteSignature(id, Number(user.organizationId));
  }

  @Get(':id/signature')
  @ApiOperation({ summary: 'ดูรูปลายเซ็น (raw image stream)' })
  async getSignature(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const { buffer, mimeType } = await this.svc.getSignatureBuffer(id, Number(user.organizationId));
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  }
}
