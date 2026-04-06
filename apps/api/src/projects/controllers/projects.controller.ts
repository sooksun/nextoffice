import { Controller, Get, Post, Put, Param, Query, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectsService } from '../services/projects.service';
import { ProjectMatchingService } from '../services/project-matching.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly matchingService: ProjectMatchingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List projects with filters' })
  @ApiQuery({ name: 'organizationId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false })
  findAll(
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: string,
  ) {
    return this.projectsService.findAll(
      organizationId ? Number(organizationId) : undefined,
      status,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  create(
    @Body() body: {
      organizationId: number;
      name: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      budgetAmount?: number;
      responsibleUserId?: number;
      policyAlignment?: string;
      topics?: { topicCode: string; score?: number }[];
    },
  ) {
    return this.projectsService.create(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID with topics, documents, reports' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a project' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      name?: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      budgetAmount?: number;
      responsibleUserId?: number;
      policyAlignment?: string;
    },
  ) {
    return this.projectsService.update(id, body);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List documents linked to a project' })
  getDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.getDocuments(id);
  }

  @Post(':id/documents')
  @ApiOperation({ summary: 'Manually link a document to a project' })
  addDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      inboundCaseId?: number;
      documentId?: number;
      linkType?: string;
      matchScore?: number;
      matchRationale?: string;
    },
  ) {
    return this.projectsService.addDocument(id, body);
  }

  @Get('cases/:caseId/project-matches')
  @ApiOperation({ summary: 'Get/compute project matches for a case' })
  getProjectMatches(@Param('caseId', ParseIntPipe) caseId: number) {
    return this.matchingService.matchCase(caseId);
  }

  @Get('cases/:caseId/project-links')
  @ApiOperation({ summary: 'Get existing project links for a case' })
  getProjectLinks(@Param('caseId', ParseIntPipe) caseId: number) {
    return this.matchingService.getMatchesForCase(caseId);
  }
}
