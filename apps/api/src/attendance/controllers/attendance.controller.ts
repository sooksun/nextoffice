import { Controller, Post, Get, Query, Body, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { AttendanceService } from '../services/attendance.service';
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

@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  @Post('register-face')
  @HttpCode(200)
  @ApiOperation({ summary: 'ลงทะเบียนใบหน้า' })
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
  @ApiOperation({ summary: 'ลงเวลาเข้า (face + GPS)' })
  checkIn(@CurrentUser() user: any, @Body() body: CheckInDto) {
    return this.svc.checkIn(
      Number(user.id),
      Number(user.organizationId),
      body.imageBase64,
      body.latitude,
      body.longitude,
    );
  }

  @Post('check-out')
  @HttpCode(200)
  @ApiOperation({ summary: 'ลงเวลาออก (face + GPS)' })
  checkOut(@CurrentUser() user: any, @Body() body: CheckInDto) {
    return this.svc.checkOut(
      Number(user.id),
      Number(user.organizationId),
      body.imageBase64,
      body.latitude,
      body.longitude,
    );
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
    return this.svc.getHistory(
      Number(user.id),
      month ? Number(month) : undefined,
      year ? Number(year) : undefined,
    );
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
}
