import { Module } from '@nestjs/common';
import { StaffConfigController } from './staff-config.controller';
import { StaffConfigService } from './staff-config.service';
import { IntakeModule } from '../intake/intake.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [IntakeModule, AuthModule],
  controllers: [StaffConfigController],
  providers: [StaffConfigService],
})
export class StaffConfigModule {}
