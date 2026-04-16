import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WebboardService } from './webboard.service';

@UseGuards(JwtAuthGuard)
@Controller('webboard')
export class WebboardController {
  constructor(private readonly svc: WebboardService) {}

  @Get('threads')
  findAll(
    @CurrentUser() user: any,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.findAllThreads(BigInt(user.organizationId), { category, search });
  }

  @Get('threads/:id')
  findThread(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.findThread(BigInt(id), BigInt(user.organizationId));
  }

  @Post('threads')
  createThread(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.createThread(BigInt(user.organizationId), BigInt(user.id), body);
  }

  @Post('threads/:id/replies')
  createReply(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('content') content: string,
  ) {
    return this.svc.createReply(BigInt(id), BigInt(user.organizationId), BigInt(user.id), content);
  }
}
