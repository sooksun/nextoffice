import { Module } from '@nestjs/common';
import { AcademicYearsController } from './controllers/academic-years.controller';
import { AcademicYearsService } from './services/academic-years.service';

@Module({
  controllers: [AcademicYearsController],
  providers: [AcademicYearsService],
  exports: [AcademicYearsService],
})
export class AcademicYearsModule {}
