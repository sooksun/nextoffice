import { Module } from '@nestjs/common';
import { AcademicYearsController } from './controllers/academic-years.controller';
import { AcademicYearsService } from './services/academic-years.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AcademicYearsController],
  providers: [AcademicYearsService],
  exports: [AcademicYearsService],
})
export class AcademicYearsModule {}
