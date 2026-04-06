import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SystemPromptsService } from './system-prompts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('system-prompts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('system-prompts')
export class SystemPromptsController {
  constructor(private readonly svc: SystemPromptsService) {}

  @Get()
  @ApiOperation({ summary: 'ดึง prompt ทั้งหมด' })
  listAll() {
    return this.svc.listAll();
  }

  @Patch(':key')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: 'แก้ไข prompt' })
  update(
    @Param('key') key: string,
    @Body() body: { promptText?: string; temperature?: number; maxTokens?: number; label?: string; description?: string },
    @CurrentUser() user: any,
  ) {
    return this.svc.update(key, body, user?.email || user?.fullName);
  }

  @Post(':key/reset')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: 'รีเซ็ต prompt กลับค่าเริ่มต้น' })
  reset(@Param('key') key: string) {
    return this.svc.resetToDefault(key);
  }
}
