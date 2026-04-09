import { Controller, Get, Param, Res, ParseIntPipe, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StampStorageService } from './services/stamp-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../intake/services/file-storage.service';

@ApiTags('stamps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stamps')
export class StampsController {
  constructor(
    private readonly stampStorage: StampStorageService,
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
  ) {}

  /**
   * GET /stamps/intake/:intakeId/view
   * Serves the stamped PDF if it exists; falls back to the original file.
   * Used by the Next.js proxy route (/api/files/intake/:id?stamped=true).
   */
  @Get('intake/:intakeId/view')
  async view(
    @Param('intakeId', ParseIntPipe) intakeId: number,
    @Res() res: Response,
  ) {
    // Try stamped version first
    const stamped = await this.stampStorage.get(intakeId);
    if (stamped) {
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
      });
      res.end(stamped);
      return;
    }

    // Fallback — serve original file
    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: BigInt(intakeId) },
    });
    if (!intake) throw new NotFoundException('Intake not found');

    const buffer = await this.fileStorage.getBuffer(intake.storagePath);
    res.set({
      'Content-Type': intake.mimeType ?? 'application/pdf',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(buffer);
  }
}
