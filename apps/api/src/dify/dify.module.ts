import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CasesModule } from '../cases/cases.module';
import { DifyApiService } from './dify-api.service';
import { DifyContextService } from './dify-context.service';
import { DifyController } from './dify.controller';
import { DifyToolsController } from './dify-tools.controller';
import { DifyToolsService } from './dify-tools.service';
import { DifyToolsGuard } from './dify-tools.guard';
import { DifyAuditService } from './dify-audit.service';
import { DifyRateLimitService } from './dify-rate-limit.service';
import { DifyToolsAuditInterceptor } from './dify-tools-audit.interceptor';
import { DifyAdminController } from './dify-admin.controller';

@Module({
  imports: [AuthModule, CasesModule],
  controllers: [DifyController, DifyToolsController, DifyAdminController],
  providers: [
    DifyApiService,
    DifyContextService,
    DifyToolsService,
    DifyToolsGuard,
    DifyAuditService,
    DifyRateLimitService,
    DifyToolsAuditInterceptor,
  ],
  exports: [DifyApiService, DifyContextService, DifyAuditService],
})
export class DifyModule {}
