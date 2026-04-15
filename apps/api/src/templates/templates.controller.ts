import { Controller, Post, Body, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('templates')
@Controller('templates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TemplatesController {
  constructor(private readonly svc: TemplatesService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate government form PDF (แบบที่ 1–6)' })
  async generate(
    @Body() dto: {
      type: 'krut' | 'memo' | 'stamp_letter' | 'directive' | 'public_relation' | 'certificate';
      data: any;
    },
    @Res() res: Response,
  ) {
    let buffer: Buffer;

    switch (dto.type) {
      case 'krut':
        buffer = await this.svc.generateKrut(dto.data);
        break;
      case 'memo':
        buffer = await this.svc.generateMemo(dto.data);
        break;
      case 'stamp_letter':
        buffer = await this.svc.generateStampLetter(dto.data);
        break;
      case 'directive':
        buffer = await this.svc.generateDirective(dto.data);
        break;
      case 'public_relation':
        buffer = await this.svc.generatePublicRelation(dto.data);
        break;
      case 'certificate':
        buffer = await this.svc.generateCertificate(dto.data);
        break;
      default:
        return res.status(400).json({ error: `Unknown template type: ${(dto as any).type}` });
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${dto.type}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
