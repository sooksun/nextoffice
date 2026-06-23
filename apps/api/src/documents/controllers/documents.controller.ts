import { Controller, Get, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { DocumentsService } from '../services/documents.service';
import { IntakeService } from '../../intake/services/intake.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly docsSvc: DocumentsService,
    private readonly intakeSvc: IntakeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all knowledge documents' })
  listDocuments(@Query() query: any) {
    return this.docsSvc.listDocuments(query);
  }

  // NOTE: literal `intakes` routes must precede `:id` — otherwise `:id` (with
  // ParseIntPipe) shadows `GET /documents/intakes` and the list 400s.
  @Get('intakes')
  @ApiOperation({ summary: 'List all document intakes' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'sourceChannel', required: false })
  @ApiQuery({ name: 'classificationLabel', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listIntakes(@Query() query: any, @CurrentUser() user: any) {
    return this.intakeSvc.listIntakes({ ...query, organizationId: Number(user.organizationId) });
  }

  @Get('intakes/:id')
  @ApiOperation({ summary: 'Get document intake detail' })
  getIntakeDetail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.intakeSvc.findById(id, Number(user.organizationId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by ID' })
  findDocument(@Param('id', ParseIntPipe) id: number) {
    return this.docsSvc.findDocumentById(id);
  }
}
