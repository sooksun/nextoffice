import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MessagesService } from './messages.service';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly svc: MessagesService) {}

  @Get('inbox')
  inbox(@CurrentUser() user: any) {
    return this.svc.findInbox(BigInt(user.organizationId), BigInt(user.id));
  }

  @Get('sent')
  sent(@CurrentUser() user: any) {
    return this.svc.findSent(BigInt(user.organizationId), BigInt(user.id));
  }

  @Get('unread')
  unread(@CurrentUser() user: any) {
    return this.svc.getUnreadCount(BigInt(user.organizationId), BigInt(user.id));
  }

  @Post()
  send(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.send(BigInt(user.organizationId), BigInt(user.id), body);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.markRead(BigInt(id), BigInt(user.id));
  }
}
