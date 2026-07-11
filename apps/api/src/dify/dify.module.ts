import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CasesModule } from '../cases/cases.module';
import { DifyApiService } from './dify-api.service';
import { DifyContextService } from './dify-context.service';
import { DifyController } from './dify.controller';

@Module({
  imports: [AuthModule, CasesModule],
  controllers: [DifyController],
  providers: [DifyApiService, DifyContextService],
  exports: [DifyApiService, DifyContextService],
})
export class DifyModule {}
