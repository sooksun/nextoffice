import { Controller, Post, Get, Put, Delete, Param, Query, Body, HttpCode, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray } from 'class-validator';
import { AttendanceService } from '../services/attendance.service';
import { ReviewService } from '../services/review.service';
import { AdminEnrollmentService } from '../services/admin-enrollment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

class RegisterFaceDto {
  @IsString() @IsNotEmpty()
  imageBase64: string;
}

class CheckInDto {
  @IsString() @IsNotEmpty()
  imageBase64: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}

// V2 DTOs
class EnrollFrameDto {
  @IsString() @IsNotEmpty()
  imageBase64: string;
}

class CheckInV2Dto {
  @IsArray()
  frames: string[];

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}

class FaceConfigDto {
  @IsOptional() @IsNumber()
  acceptThreshold?: number;

  @IsOptional() @IsNumber()
  reviewThreshold?: number;

  @IsOptional() @IsNumber()
  minMargin?: number;

  @IsOptional() @IsNumber()
  minQualityScore?: number;

  @IsOptional() @IsNumber()
  minLivenessScore?: number;

  @IsOptional() @IsString()
  livenessMode?: string;

  @IsOptional() @IsNumber()
  minTemplatesRequired?: number;

  @IsOptional() @IsString()
  reviewPolicy?: string;
}

class ReviewActionDto {
  @IsOptional() @IsString()
  note?: string;
}

class ReviewReassignDto {
  @IsNumber()
  finalPersonId: number;

  @IsOptional() @IsString()
  note?: string;
}

class AdminUploadFrameDto {
  @IsString() @IsNotEmpty()
  imageBase64: string;
}

@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly svc: AttendanceService,
    private readonly reviewSvc: ReviewService,
    private readonly adminEnrollSvc: AdminEnrollmentService,
  ) {}

  // ── V1 Legacy ─────────────────────────────────────────────────────────────

  @Post('register-face')
  @HttpCode(200)
  @ApiOperation({ summary: '[V1] ลงทะเบียนใบหน้า (single image)' })
  registerFace(@CurrentUser() user: any, @Body() body: RegisterFaceDto) {
    return this.svc.registerFace(Number(user.id), Number(user.organizationId), body.imageBase64);
  }

  @Get('face-status')
  @ApiOperation({ summary: 'สถานะการลงทะเบียนใบหน้า' })
  faceStatus(@CurrentUser() user: any) {
    return this.svc.getFaceStatus(Number(user.id));
  }

  @Post('check-in')
  @HttpCode(200)
  @ApiOperation({ summary: '[V1] ลงเวลาเข้า (face + GPS)' })
  checkIn(@CurrentUser() user: any, @Body() body: CheckInDto) {
    return this.svc.checkIn(Number(user.id), Number(user.organizationId), body.imageBase64, body.latitude, body.longitude);
  }

  @Post('check-out')
  @HttpCode(200)
  @ApiOperation({ summary: '[V1] ลงเวลาออก (face + GPS)' })
  checkOut(@CurrentUser() user: any, @Body() body: CheckInDto) {
    return this.svc.checkOut(Number(user.id), Number(user.organizationId), body.imageBase64, body.latitude, body.longitude);
  }

  @Get('today')
  @ApiOperation({ summary: 'สถานะลงเวลาวันนี้' })
  getToday(@CurrentUser() user: any) {
    return this.svc.getToday(Number(user.id));
  }

  @Get('history')
  @ApiOperation({ summary: 'ประวัติลงเวลาตัวเอง' })
  getHistory(
    @CurrentUser() user: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.svc.getHistory(Number(user.id), month ? Number(month) : undefined, year ? Number(year) : undefined);
  }

  @Get('report')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR')
  @ApiOperation({ summary: 'รายงานลงเวลาทั้งโรงเรียน' })
  getReport(
    @CurrentUser() user: any,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    return this.svc.getReport(Number(user.organizationId), dateFrom, dateTo);
  }

  // ── V2: Enrollment ────────────────────────────────────────────────────────

  @Get('enrollment/status')
  @ApiOperation({ summary: '[V2] สถานะ enrollment ใบหน้า' })
  enrollmentStatus(@CurrentUser() user: any) {
    return this.svc.getEnrollmentStatus(Number(user.id), Number(user.organizationId));
  }

  @Post('enrollment/upload-frame')
  @HttpCode(200)
  @ApiOperation({ summary: '[V2] ส่งภาพ enrollment 1 เฟรม' })
  enrollFrame(@CurrentUser() user: any, @Body() body: EnrollFrameDto) {
    return this.svc.enrollFrame(Number(user.id), Number(user.organizationId), body.imageBase64);
  }

  @Post('enrollment/finalize')
  @HttpCode(200)
  @ApiOperation({ summary: '[V2] ยืนยัน enrollment เสร็จสิ้น' })
  finalizeEnrollment(@CurrentUser() user: any) {
    return this.svc.finalizeEnrollment(Number(user.id), Number(user.organizationId));
  }

  // ── V2: Scan ──────────────────────────────────────────────────────────────

  @Post('check-in-v2')
  @HttpCode(200)
  @ApiOperation({ summary: '[V2] ลงเวลาเข้า multi-frame + decision engine' })
  checkInV2(@CurrentUser() user: any, @Body() body: CheckInV2Dto) {
    return this.svc.checkInV2(Number(user.id), Number(user.organizationId), body.frames, body.latitude, body.longitude);
  }

  // ── V2: Face Config ───────────────────────────────────────────────────────

  @Get('face-config')
  @ApiOperation({ summary: '[V2] ดู face config ของโรงเรียน' })
  getFaceConfig(@CurrentUser() user: any) {
    return this.svc.getFaceConfig(Number(user.organizationId));
  }

  @Put('face-config')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: '[V2] แก้ไข face config' })
  updateFaceConfig(@CurrentUser() user: any, @Body() body: FaceConfigDto) {
    return this.svc.updateFaceConfig(Number(user.organizationId), body);
  }

  // ── V2: Review Queue ─────────────────────────────────────────────────────

  @Get('reviews/pending')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'CLERK')
  @ApiOperation({ summary: '[V2] รายการรอ review' })
  getPendingReviews(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviewSvc.getPending(Number(user.organizationId), page ? Number(page) : 1, limit ? Number(limit) : 20);
  }

  @Post('reviews/:id/confirm')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'CLERK')
  @ApiOperation({ summary: '[V2] ยืนยัน review (confirm attendance)' })
  confirmReview(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: ReviewActionDto,
  ) {
    return this.reviewSvc.confirm(Number(id), Number(user.id), Number(user.organizationId), body.note);
  }

  @Post('reviews/:id/reject')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'CLERK')
  @ApiOperation({ summary: '[V2] ปฏิเสธ review' })
  rejectReview(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: ReviewActionDto,
  ) {
    return this.reviewSvc.reject(Number(id), Number(user.id), Number(user.organizationId), body.note);
  }

  @Post('reviews/:id/reassign')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR')
  @ApiOperation({ summary: '[V2] reassign บุคคลใน review' })
  reassignReview(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: ReviewReassignDto,
  ) {
    return this.reviewSvc.reassign(Number(id), Number(user.id), Number(user.organizationId), body.finalPersonId, body.note);
  }

  // ── Admin: Enrollment Management ──────────────────────────────────────────

  @Get('admin/enrollments')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR')
  @ApiOperation({ summary: '[Admin] รายชื่อบุคลากรทั้งหมด + สถานะ enrollment' })
  listEnrollments(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminEnrollSvc.listEnrollments(
      Number(user.organizationId),
      search,
      status,
      page ? Number(page) : 1,
      limit ? Number(limit) : 30,
    );
  }

  @Get('admin/enrollments/:userId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'CLERK')
  @ApiOperation({ summary: '[Admin] ดู face profile + templates ของบุคคล' })
  getUserEnrollment(@Param('userId') userId: string, @CurrentUser() user: any) {
    return this.adminEnrollSvc.getUserEnrollment(Number(userId), Number(user.organizationId));
  }

  @Post('admin/enrollments/:userId/upload-frame')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'CLERK')
  @ApiOperation({ summary: '[Admin] เพิ่มรูปใบหน้าให้บุคคล' })
  adminUploadFrame(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
    @Body() body: AdminUploadFrameDto,
  ) {
    return this.adminEnrollSvc.adminUploadFrame(Number(userId), Number(user.organizationId), body.imageBase64);
  }

  @Post('admin/enrollments/:userId/activate')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: '[Admin] ยืนยัน enrollment ของบุคคล' })
  activateProfile(@Param('userId') userId: string, @CurrentUser() user: any) {
    return this.adminEnrollSvc.activateProfile(Number(userId), Number(user.organizationId));
  }

  @Post('admin/enrollments/:userId/reset')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: '[Admin] ล้าง face profile บุคคล (เริ่มใหม่)' })
  resetProfile(@Param('userId') userId: string, @CurrentUser() user: any) {
    return this.adminEnrollSvc.resetProfile(Number(userId), Number(user.organizationId));
  }

  @Delete('admin/enrollments/templates/:templateId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'CLERK')
  @ApiOperation({ summary: '[Admin] ลบรูปใบหน้า 1 รูป' })
  deleteTemplate(@Param('templateId') templateId: string, @CurrentUser() user: any) {
    return this.adminEnrollSvc.deleteTemplate(Number(templateId), Number(user.organizationId));
  }

  @Get('admin/enrollments/templates/:templateId/image')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'CLERK')
  @ApiOperation({ summary: '[Admin] ดูภาพ face template' })
  async getTemplateImage(
    @Param('templateId') templateId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const { buffer } = await this.adminEnrollSvc.getTemplateImageBuffer(
      Number(templateId),
      Number(user.organizationId),
    );
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  }
}
