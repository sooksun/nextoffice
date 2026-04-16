import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PresentationService } from './presentation.service';

@UseGuards(JwtAuthGuard)
@Controller('presentation')
export class PresentationController {
  constructor(private readonly svc: PresentationService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('mode') mode?: string,
  ) {
    return this.svc.findAll(BigInt(user.organizationId), {
      status,
      mode,
      userId: BigInt(user.id),
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
    @Body('directorNote') note?: string,
  ) {
    return this.svc.updateStatus(BigInt(id), BigInt(user.organizationId), status, note);
  }
}
