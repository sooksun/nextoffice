import { Module } from '@nestjs/common';
import { GeminiApiService } from './gemini-api.service';

@Module({
  providers: [GeminiApiService],
  exports: [GeminiApiService],
})
export class GeminiModule {}
