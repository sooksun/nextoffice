import { Module } from '@nestjs/common';
import { StampsController } from './stamps.controller';
import { PdfStampService } from './services/pdf-stamp.service';
import { StampStorageService } from './services/stamp-storage.service';
import { EmptySpaceService } from './services/empty-space.service';
import { StampCanvasService } from './services/stamp-canvas.service';
import { IntakeModule } from '../intake/intake.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [IntakeModule, PrismaModule, AuthModule, GeminiModule],
  controllers: [StampsController],
  providers: [EmptySpaceService, StampCanvasService, PdfStampService, StampStorageService],
  exports: [PdfStampService, StampStorageService, EmptySpaceService],
})
export class StampsModule {}
