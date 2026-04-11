import { Module } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { PdfSigningService } from './pdf-signing.service';
import { DigitalSignatureController } from './digital-signature.controller';
import { IntakeModule } from '../intake/intake.module';
import { StampsModule } from '../stamps/stamps.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [IntakeModule, StampsModule, AuthModule],
  controllers: [DigitalSignatureController],
  providers: [CertificateService, PdfSigningService],
  exports: [CertificateService, PdfSigningService],
})
export class DigitalSignatureModule {}
