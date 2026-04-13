import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CalendarService } from './calendar.service';

@ApiTags('calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly svc: CalendarService) {}

  @Get('events')
  @ApiOperation({ summary: 'รายการกิจกรรมปฏิทิน (attendance + leave + travel)' })
  @ApiQuery({ name: 'from', required: true, example: '2026-04-01' })
  @ApiQuery({ name: 'to', required: true, example: '2026-04-30' })
  async getEvents(
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const orgId = BigInt(user.organizationId);
    const fromDate = new Date(from);
    const toDate = new Date(to);
    return this.svc.getEvents(orgId, fromDate, toDate);
  }

  @Get('users')
  @ApiOperation({ summary: 'รายชื่อผู้ใช้ในองค์กร (สำหรับ filter ปฏิทิน)' })
  async getUsers(@CurrentUser() user: any) {
    const orgId = BigInt(user.organizationId);
    return this.svc.getUsers(orgId);
  }
}
