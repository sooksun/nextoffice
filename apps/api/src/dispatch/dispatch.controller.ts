import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DispatchService } from './dispatch.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('dispatch')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dispatch')
export class DispatchController {
  constructor(private readonly svc: DispatchService) {}

  @Get()
  @ApiOperation({ summary: 'List dispatch entries for current organization' })
  @ApiQuery({ name: 'status', required: false })
  findAll(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.svc.findAll(Number(user.organizationId), status);
  }

  @Post()
  @ApiOperation({ summary: 'Create dispatch entry' })
  create(
    @CurrentUser() user: any,
    @Body() dto: {
      registryId: number;
      recipientOrg: string;
      recipientName?: string;
      deliveryMethod: string;
      remarks?: string;
    },
  ) {
    return this.svc.create(Number(user.organizationId), Number(user.id), dto);
  }

  @Post(':id/deliver')
  @ApiOperation({ summary: 'Mark dispatch as delivered' })
  markDelivered(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { receivedBy: string },
  ) {
    return this.svc.markDelivered(id, body.receivedBy);
  }

  @Get(':id/receipt-pdf')
  @ApiOperation({ summary: 'Generate receipt slip PDF' })
  async receiptPdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.svc.generateReceiptPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${id}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }
}
