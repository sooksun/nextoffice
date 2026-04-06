import { Global, Module } from '@nestjs/common';
import { SystemPromptsService } from './system-prompts.service';
import { SystemPromptsController } from './system-prompts.controller';

@Global()
@Module({
  controllers: [SystemPromptsController],
  providers: [SystemPromptsService],
  exports: [SystemPromptsService],
})
export class SystemPromptsModule {}
