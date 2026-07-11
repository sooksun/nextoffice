import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DifyApiService } from './dify-api.service';
import { DifyController } from './dify.controller';

@Module({
  imports: [AuthModule],
  controllers: [DifyController],
  providers: [DifyApiService],
  exports: [DifyApiService],
})
export class DifyModule {}
