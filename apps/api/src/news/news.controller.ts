import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NewsService } from './news.service';

@UseGuards(JwtAuthGuard)
@Controller('news')
export class NewsController {
  constructor(private readonly svc: NewsService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.findAll(BigInt(user.organizationId), { status, search });
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.findOne(BigInt(id), BigInt(user.organizationId));
  }

  @Post()
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.create(BigInt(user.organizationId), BigInt(user.id), body);
  }

  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(BigInt(id), BigInt(user.organizationId), body);
  }

  @Delete(':id')
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.delete(BigInt(id), BigInt(user.organizationId));
  }
}
