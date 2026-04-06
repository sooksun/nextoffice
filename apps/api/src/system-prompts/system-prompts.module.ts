import { Global, Module, forwardRef } from '@nestjs/common';
import { SystemPromptsService } from './system-prompts.service';
import { SystemPromptsController } from './system-prompts.controller';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [SystemPromptsController],
  providers: [SystemPromptsService],
  exports: [SystemPromptsService],
})
export class SystemPromptsModule {}
