import { Controller, Get, Post, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { WorkflowLearningService } from '../services/workflow-learning.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('workflow-patterns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workflow-patterns')
export class WorkflowPatternsController {
  constructor(private readonly workflowLearning: WorkflowLearningService) {}

  @Get()
  @ApiOperation({ summary: 'List workflow patterns for an organization' })
  @ApiQuery({ name: 'organizationId', required: true, type: Number })
  getPatterns(@Query('organizationId', ParseIntPipe) organizationId: number) {
    return this.workflowLearning.getPatterns(organizationId);
  }

  @Post('learn/:caseId')
  @ApiOperation({ summary: 'Manually trigger learning from a completed case' })
  learnFromCase(@Param('caseId', ParseIntPipe) caseId: number) {
    return this.workflowLearning.learnFromCase(caseId);
  }
}
