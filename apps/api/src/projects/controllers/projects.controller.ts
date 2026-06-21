import { Controller, Get, Post, Put, Param, Query, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectsService } from '../services/projects.service';
import { ProjectMatchingService } from '../services/project-matching.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

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
    @CurrentUser() user: any,
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: string,
  ) {
    const effectiveOrgId =
      user.roleCode === 'ADMIN' && organizationId
        ? Number(organizationId)
        : Number(user.organizationId);
    return this.projectsService.findAll(effectiveOrgId, status);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  create(
    @CurrentUser() user: any,
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
    // Non-ADMIN callers can only create projects in their own organization
    const organizationId =
      user.roleCode === 'ADMIN' && body.organizationId
        ? body.organizationId
        : Number(user.organizationId);
    return this.projectsService.create({ ...body, organizationId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID with topics, documents, reports' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.projectsService.findOne(id, Number(user.organizationId));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a project' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
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
    return this.projectsService.update(id, body, Number(user.organizationId));
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List documents linked to a project' })
  getDocuments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.projectsService.getDocuments(id, Number(user.organizationId));
  }

  @Post(':id/documents')
  @ApiOperation({ summary: 'Manually link a document to a project' })
  addDocument(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: {
      inboundCaseId?: number;
      documentId?: number;
      linkType?: string;
      matchScore?: number;
      matchRationale?: string;
    },
  ) {
    return this.projectsService.addDocument(id, body, Number(user.organizationId));
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
