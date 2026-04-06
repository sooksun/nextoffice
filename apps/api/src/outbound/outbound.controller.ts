import { Controller, Get, Post, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OutboundService } from './outbound.service';

@ApiTags('outbound')
@Controller('outbound')
export class OutboundController {
  constructor(private readonly svc: OutboundService) {}

  @Get(':organizationId/documents')
  @ApiOperation({ summary: 'List outbound documents for an organization' })
  @ApiQuery({ name: 'status', required: false })
  listDocuments(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('status') status?: string,
  ) {
    return this.svc.findAll(organizationId, status);
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Get outbound document by ID' })
  getDocument(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post('documents')
  @ApiOperation({ summary: 'Create a draft outbound document' })
  create(@Body() dto: {
    organizationId: number;
    createdByUserId?: number;
    subject: string;
    bodyText?: string;
    recipientName?: string;
    recipientOrg?: string;
    recipientEmail?: string;
    urgencyLevel?: string;
    securityLevel?: string;
    relatedInboundCaseId?: number;
    sentMethod?: string;
  }) {
    return this.svc.create(dto);
  }

  @Post('documents/:id/approve')
  @ApiOperation({ summary: 'Approve document and assign document number' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { approvedByUserId: number },
  ) {
    return this.svc.approve(id, body.approvedByUserId);
  }

  @Post('documents/:id/send')
  @ApiOperation({ summary: 'Mark document as sent and create registry entry' })
  send(@Param('id', ParseIntPipe) id: number) {
    return this.svc.send(id);
  }

  @Get(':organizationId/registry')
  @ApiOperation({ summary: 'Get document registry (ทะเบียน)' })
  @ApiQuery({ name: 'type', required: false, description: 'inbound | outbound | archive | destroy' })
  @ApiQuery({ name: 'academicYearId', required: false, type: Number })
  getRegistry(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('type') registryType?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.svc.getRegistry(
      organizationId,
      registryType,
      academicYearId ? parseInt(academicYearId, 10) : undefined,
    );
  }

  @Post('ai-draft')
  @ApiOperation({ summary: 'V2: Generate AI draft for outbound document' })
  generateAiDraft(@Body() dto: {
    caseId: number;
    draftType: string;
    additionalContext?: string;
  }) {
    return this.svc.generateAiDraft(dto.caseId, dto.draftType, dto.additionalContext);
  }

  @Post('registry/inbound/:caseId')
  @ApiOperation({ summary: 'Create inbound registry entry for a case' })
  registerInbound(@Param('caseId', ParseIntPipe) caseId: number) {
    return this.svc.registerInbound(caseId);
  }
}
