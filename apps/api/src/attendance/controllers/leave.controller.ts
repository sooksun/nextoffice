import { Controller, Post, Get, Patch, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeaveService } from '../services/leave.service';
import { TravelService } from '../services/travel.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('leave')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attendance/leave')
export class LeaveController {
  constructor(
    private readonly leaveSvc: LeaveService,
    private readonly travelSvc: TravelService,
  ) {}

  // ─── Leave Requests ─────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'สร้างใบลา' })
  createLeave(@CurrentUser() user: any, @Body() body: any) {
    return this.leaveSvc.create(Number(user.id), Number(user.organizationId), body);
  }

  @Get('my-requests')
  @ApiOperation({ summary: 'ใบลาของฉัน' })
  getMyLeaves(@CurrentUser() user: any) {
    return this.leaveSvc.getMyRequests(Number(user.id));
  }

  @Get('pending')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'HEAD_TEACHER')
  @ApiOperation({ summary: 'ใบลาที่รออนุมัติ' })
  getPendingLeaves(@CurrentUser() user: any) {
    return this.leaveSvc.getPendingApprovals(Number(user.id), Number(user.organizationId));
  }

  @Get('balance')
  @ApiOperation({ summary: 'วันลาคงเหลือ' })
  getBalance(@CurrentUser() user: any) {
    return this.leaveSvc.getBalance(Number(user.id));
  }

  @Get(':id')
  @ApiOperation({ summary: 'รายละเอียดใบลา' })
  getLeave(@Param('id', ParseIntPipe) id: number) {
    return this.leaveSvc.getById(id);
  }

  @Patch(':id/submit')
  @ApiOperation({ summary: 'ส่งใบลาเพื่อขออนุมัติ' })
  submitLeave(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.leaveSvc.submit(id, Number(user.id));
  }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'HEAD_TEACHER')
  @ApiOperation({ summary: 'อนุมัติใบลา' })
  approveLeave(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: { note?: string },
  ) {
    return this.leaveSvc.approve(id, Number(user.id), body.note);
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'HEAD_TEACHER')
  @ApiOperation({ summary: 'ไม่อนุมัติใบลา' })
  rejectLeave(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: { reason: string },
  ) {
    return this.leaveSvc.reject(id, Number(user.id), body.reason);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'ยกเลิกใบลา' })
  cancelLeave(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.leaveSvc.cancel(id, Number(user.id));
  }

  // ─── Travel Requests ────────────────────────────────

  @Post('travel')
  @ApiOperation({ summary: 'สร้างคำขอไปราชการ' })
  createTravel(@CurrentUser() user: any, @Body() body: any) {
    return this.travelSvc.create(Number(user.id), Number(user.organizationId), body);
  }

  @Get('travel/my-requests')
  @ApiOperation({ summary: 'คำขอไปราชการของฉัน' })
  getMyTravels(@CurrentUser() user: any) {
    return this.travelSvc.getMyRequests(Number(user.id));
  }

  @Get('travel/pending')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR')
  @ApiOperation({ summary: 'คำขอไปราชการรออนุมัติ' })
  getPendingTravels(@CurrentUser() user: any) {
    return this.travelSvc.getPendingApprovals(Number(user.organizationId));
  }

  @Get('travel/:id')
  @ApiOperation({ summary: 'รายละเอียดคำขอไปราชการ' })
  getTravel(@Param('id', ParseIntPipe) id: number) {
    return this.travelSvc.getById(id);
  }

  @Patch('travel/:id/submit')
  @ApiOperation({ summary: 'ส่งคำขอไปราชการ' })
  submitTravel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.travelSvc.submit(id, Number(user.id));
  }

  @Patch('travel/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR')
  @ApiOperation({ summary: 'อนุมัติไปราชการ' })
  approveTravel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.travelSvc.approve(id, Number(user.id));
  }

  @Patch('travel/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR')
  @ApiOperation({ summary: 'ไม่อนุมัติไปราชการ' })
  rejectTravel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: { reason: string },
  ) {
    return this.travelSvc.reject(id, Number(user.id), body.reason);
  }

  @Patch('travel/:id/cancel')
  @ApiOperation({ summary: 'ยกเลิกคำขอไปราชการ' })
  cancelTravel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.travelSvc.cancel(id, Number(user.id));
  }
}
