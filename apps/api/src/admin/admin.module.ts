import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ResetYearService } from './services/reset-year.service';
import { DemoDataService } from './services/demo-data.service';

@Module({
  controllers: [AdminController],
  providers: [ResetYearService, DemoDataService],
})
export class AdminModule {}
