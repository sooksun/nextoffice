import { Module } from '@nestjs/common';
import { CasesController } from './controllers/cases.controller';
import { CasesService } from './services/cases.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
