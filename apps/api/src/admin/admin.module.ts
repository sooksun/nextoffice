import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { ResetYearService } from './services/reset-year.service';
import { DemoDataService } from './services/demo-data.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [ResetYearService, DemoDataService],
})
export class AdminModule {}
