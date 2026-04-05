import { Module } from '@nestjs/common';
import { WorkGroupsController } from './work-groups.controller';
import { WorkGroupsService } from './work-groups.service';

@Module({
  controllers: [WorkGroupsController],
  providers: [WorkGroupsService],
  exports: [WorkGroupsService],
})
export class WorkGroupsModule {}
