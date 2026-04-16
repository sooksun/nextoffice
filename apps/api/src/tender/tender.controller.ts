import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenderService } from './tender.service';

@UseGuards(JwtAuthGuard)
@Controller('tender')
export class TenderController {
  constructor(private readonly svc: TenderService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('tenderType') tenderType?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.findAll(BigInt(user.organizationId), { status, tenderType, search });
  }

  @Post()
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.create(BigInt(user.organizationId), BigInt(user.id), body);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.svc.updateStatus(BigInt(id), BigInt(user.organizationId), status);
  }
}
