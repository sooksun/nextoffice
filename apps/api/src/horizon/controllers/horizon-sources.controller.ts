import { Controller, Get, Post, Put, Param, Query, Body, ParseIntPipe, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { HorizonSourceService } from '../services/horizon-source.service';
import { HorizonPipelineService } from '../services/horizon-pipeline.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('horizon-sources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('horizon/sources')
export class HorizonSourcesController {
  private readonly logger = new Logger(HorizonSourcesController.name);

  constructor(
    private readonly sourceService: HorizonSourceService,
    private readonly pipelineService: HorizonPipelineService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all horizon sources' })
  @ApiQuery({ name: 'sourceType', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('sourceType') sourceType?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    return this.sourceService.findAll({
      sourceType,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new horizon source' })
  create(
    @Body() body: {
      sourceCode: string;
      sourceName: string;
      sourceType: string;
      organizationName: string;
      baseUrl: string;
      trustLevel?: number;
      fetchFrequency?: string;
      configJson?: string;
    },
  ) {
    return this.sourceService.create(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a horizon source' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<{
      sourceName: string;
      sourceType: string;
      organizationName: string;
      baseUrl: string;
      trustLevel: number;
      fetchFrequency: string;
      configJson: string;
      isActive: boolean;
    }>,
  ) {
    return this.sourceService.update(id, body);
  }

  @Post(':id/fetch')
  @ApiOperation({ summary: 'Trigger full pipeline for a source (fetch → normalize → classify → embed)' })
  triggerFetch(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Manual pipeline triggered for source #${id}`);
    return this.pipelineService.runForSource(id);
  }
}
