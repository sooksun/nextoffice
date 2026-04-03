import { Controller, Get, Post, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CasesService } from '../services/cases.service';

@ApiTags('cases')
@Controller('cases')
export class CasesController {
  constructor(private readonly svc: CasesService) {}

  @Get()
  @ApiOperation({ summary: 'List all cases' })
  @ApiQuery({ name: 'organizationId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false })
  listCases(@Query('organizationId') orgId?: string, @Query('status') status?: string) {
    return this.svc.listCases(orgId ? Number(orgId) : undefined, status);
  }

  @Post('from-intake/:documentIntakeId')
  @ApiOperation({ summary: 'Create case from a classified document intake' })
  createFromIntake(@Param('documentIntakeId', ParseIntPipe) documentIntakeId: number) {
    return this.svc.createFromIntake(documentIntakeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get case by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Get(':id/options')
  @ApiOperation({ summary: 'Get AI-generated options for a case' })
  getOptions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getOptions(id);
  }
}
