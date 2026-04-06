import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProjectsService } from './services/projects.service';
import { ProjectMatchingService } from './services/project-matching.service';
import { WorkflowLearningService } from './services/workflow-learning.service';
import { ProjectsController } from './controllers/projects.controller';
import { WorkflowPatternsController } from './controllers/workflow-patterns.controller';

@Module({
  imports: [ConfigModule],
  controllers: [ProjectsController, WorkflowPatternsController],
  providers: [ProjectsService, ProjectMatchingService, WorkflowLearningService],
  exports: [ProjectsService, ProjectMatchingService, WorkflowLearningService],
})
export class ProjectsModule {}
