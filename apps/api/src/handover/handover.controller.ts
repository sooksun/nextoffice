import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HandoverService } from './handover.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('handover')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('handover')
export class HandoverController {
  constructor(private readonly svc: HandoverService) {}

  @Get()
  @ApiOperation({ summary: 'List handover records for current organization' })
  findAll(@CurrentUser() user: any) {
    return this.svc.findAll(Number(user.organizationId));
  }

  @Get('eligible-documents')
  @ApiOperation({ summary: 'List documents eligible for handover (past retention)' })
  eligibleDocuments(@CurrentUser() user: any) {
    return this.svc.getEligibleDocuments(Number(user.organizationId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get handover record detail with items' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create handover draft with selected documents' })
  create(
    @CurrentUser() user: any,
    @Body() dto: {
      recipientOrg: string;
      recipientName: string;
      description?: string;
      registryIds: number[];
    },
  ) {
    return this.svc.create(Number(user.organizationId), Number(user.id), dto);
  }

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR', 'ADMIN')
  @ApiOperation({ summary: 'Approve handover (DIRECTOR/ADMIN only)' })
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.approve(id, Number(user.id));
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark handover as completed' })
  complete(@Param('id', ParseIntPipe) id: number) {
    return this.svc.complete(id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Generate handover register PDF' })
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.svc.generatePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="handover-${id}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }
}
