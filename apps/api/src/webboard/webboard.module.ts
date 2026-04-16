import { Module } from '@nestjs/common';
import { WebboardController } from './webboard.controller';
import { WebboardService } from './webboard.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [WebboardController],
  providers: [WebboardService],
})
export class WebboardModule {}
