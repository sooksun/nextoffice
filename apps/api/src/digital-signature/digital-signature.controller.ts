import { Controller, Get, Post, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CertificateService } from './certificate.service';
import { PdfSigningService } from './pdf-signing.service';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../intake/services/file-storage.service';
import { StampStorageService } from '../stamps/services/stamp-storage.service';

@ApiTags('digital-signature')
@Controller('digital-signature')
export class DigitalSignatureController {
  constructor(
    private readonly certService: CertificateService,
    private readonly pdfSigning: PdfSigningService,
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly stampStorage: StampStorageService,
  ) {}

  @Get('my-certificate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user certificate info' })
  async getMyCertificate(@CurrentUser() user: any) {
    return this.certService.getCertificateInfo(user.id);
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate or regenerate certificate' })
  async generateCertificate(@CurrentUser() user: any) {
    return this.certService.generateCertificate(user.id, user.organizationId);
  }

  @Get('verify/intake/:intakeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify signatures on inbound stamped PDF' })
  async verifyIntake(@Param('intakeId', ParseIntPipe) intakeId: number) {
    try {
      const pdfBuffer = await this.stampStorage.get(intakeId);
      if (!pdfBuffer) return { signatures: [], message: 'No stamped PDF found' };
      return this.pdfSigning.verifyPdf(pdfBuffer);
    } catch (err: any) {
      return { signatures: [], message: err.message };
    }
  }

  @Get('verify/outbound/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify signatures on outbound PDF' })
  async verifyOutbound(@Param('id', ParseIntPipe) id: number) {
    try {
      const doc = await this.prisma.outboundDocument.findUnique({
        where: { id: BigInt(id) },
        select: { storagePath: true },
      });
      if (!doc?.storagePath) return { signatures: [], message: 'No PDF found' };

      const pdfBuffer = await this.fileStorage.getBuffer(doc.storagePath);
      return this.pdfSigning.verifyPdf(pdfBuffer);
    } catch (err: any) {
      return { signatures: [], message: err.message };
    }
  }
}
