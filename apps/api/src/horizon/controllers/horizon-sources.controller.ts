import { Controller, Get, Post, Put, Param, Query, Body, ParseIntPipe, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { HorizonSourceService } from '../services/horizon-source.service';
import { HorizonFetchService } from '../services/horizon-fetch.service';

@ApiTags('horizon-sources')
@Controller('horizon/sources')
export class HorizonSourcesController {
  private readonly logger = new Logger(HorizonSourcesController.name);

  constructor(
    private readonly sourceService: HorizonSourceService,
    private readonly fetchService: HorizonFetchService,
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
  @ApiOperation({ summary: 'Trigger manual fetch for a source' })
  triggerFetch(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Manual fetch triggered for source #${id}`);
    return this.fetchService.fetchSource(id);
  }
}
