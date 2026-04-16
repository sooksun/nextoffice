import { Module } from '@nestjs/common';
import { TenderController } from './tender.controller';
import { TenderService } from './tender.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TenderController],
  providers: [TenderService],
})
export class TenderModule {}
