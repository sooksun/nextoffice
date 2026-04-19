import { Controller, Get, Param, Res, ParseIntPipe, UseGuards, NotFoundException, Logger } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StampStorageService } from './services/stamp-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../intake/services/file-storage.service';

@ApiTags('stamps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stamps')
export class StampsController {
  private readonly logger = new Logger(StampsController.name);

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
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const userOrgId = Number(user?.organizationId);

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

    // Org check — same fallback as IntakeService.getFileBuffer:
    // allow if intake is in user's org OR a case in user's org references this intake.
    if (userOrgId && intake.organizationId && Number(intake.organizationId) !== userOrgId) {
      const linkedCase = await this.prisma.inboundCase.findFirst({
        where: {
          organizationId: BigInt(userOrgId),
          description: { contains: `intake:${intakeId}` },
        },
        select: { id: true },
      });
      if (!linkedCase) {
        this.logger.warn(
          `stamps.view denied: intake #${intakeId} org=${intake.organizationId} vs user org=${userOrgId}`,
        );
        throw new NotFoundException('ไม่พบไฟล์ต้นฉบับ');
      }
    }

    if (!intake.storagePath) {
      this.logger.warn(`stamps.view: intake #${intakeId} has no storagePath`);
      throw new NotFoundException('ไม่พบไฟล์ต้นฉบับ (ไม่มีข้อมูลที่จัดเก็บ)');
    }

    try {
      const buffer = await this.fileStorage.getBuffer(intake.storagePath);
      res.set({
        'Content-Type': intake.mimeType ?? 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=3600',
      });
      res.end(buffer);
    } catch (err: any) {
      this.logger.error(
        `stamps.view: MinIO getObject failed for intake #${intakeId} path="${intake.storagePath}": ${err.message}`,
      );
      throw new NotFoundException('ไม่พบไฟล์ต้นฉบับ (ไฟล์อาจถูกลบจากที่จัดเก็บ)');
    }
  }
}
