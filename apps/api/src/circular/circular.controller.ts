import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CircularService } from './circular.service';

@UseGuards(JwtAuthGuard)
@Controller('circular')
export class CircularController {
  constructor(private readonly svc: CircularService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('take') take?: string,
  ) {
    return this.svc.findAll(BigInt(user.organizationId), {
      search,
      status,
      take: take ? Number(take) : 50,
    });
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.findOne(BigInt(id), BigInt(user.organizationId));
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
