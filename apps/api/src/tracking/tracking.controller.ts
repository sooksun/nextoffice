import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  UseGuards,
  Res,
  Req,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('tracking')
@Controller('tracking')
export class TrackingController {
  constructor(private readonly svc: TrackingService) {}

  @Post('generate/:registryId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate QR tracking code for a document registry' })
  async generate(
    @Param('registryId', ParseIntPipe) registryId: number,
    @CurrentUser() _user: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}`.replace(/:\d+$/, ':9910');
    const { qrBuffer } = await this.svc.generateTrackingCode(registryId, baseUrl);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', qrBuffer.length);
    res.send(qrBuffer);
  }

  @Get('qr/:registryId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get QR code image for existing tracking code' })
  async getQr(
    @Param('registryId', ParseIntPipe) registryId: number,
    @CurrentUser() _user: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}`.replace(/:\d+$/, ':9910');
    const qrBuffer = await this.svc.getQrCode(registryId, baseUrl);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', qrBuffer.length);
    res.send(qrBuffer);
  }

  @Get('public/:trackingCode')
  @ApiOperation({ summary: 'Public lookup by tracking code (no auth)' })
  async publicLookup(@Param('trackingCode') trackingCode: string) {
    return this.svc.publicLookup(trackingCode);
  }
}
