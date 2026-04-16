import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DownloadService } from './download.service';

@UseGuards(JwtAuthGuard)
@Controller('download')
export class DownloadController {
  constructor(private readonly svc: DownloadService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.findAll(BigInt(user.organizationId), { category, search });
  }

  @Post()
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.create(BigInt(user.organizationId), BigInt(user.id), body);
  }

  @Post(':id/download')
  increment(@Param('id') id: string) {
    return this.svc.incrementDownload(BigInt(id));
  }

  @Delete(':id')
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.delete(BigInt(id), BigInt(user.organizationId));
  }
}
