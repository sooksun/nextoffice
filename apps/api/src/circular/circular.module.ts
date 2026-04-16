import { Module } from '@nestjs/common';
import { CircularController } from './circular.controller';
import { CircularService } from './circular.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CircularController],
  providers: [CircularService],
})
export class CircularModule {}
