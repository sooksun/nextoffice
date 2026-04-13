import { Controller, Get, Post, Param, Body, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { OutboundService } from './outbound.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('outbound')
@Controller('outbound')
export class OutboundController {
  constructor(private readonly svc: OutboundService) {}

  @Get(':organizationId/documents')
  @ApiOperation({ summary: 'List outbound documents for an organization' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'letterType', required: false })
  @ApiQuery({ name: 'roleCode', required: false })
  listDocuments(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('status') status?: string,
    @Query('letterType') letterType?: string,
    @Query('roleCode') roleCode?: string,
  ) {
    return this.svc.findAll(organizationId, status, letterType, roleCode);
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Get outbound document by ID' })
  @ApiQuery({ name: 'roleCode', required: false })
  getDocument(
    @Param('id', ParseIntPipe) id: number,
    @Query('roleCode') roleCode?: string,
  ) {
    return this.svc.findOne(id, roleCode);
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
    letterType?: string;
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

  @Post('documents/:id/reject')
  @ApiOperation({ summary: 'Reject (return to draft) outbound document' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { note?: string },
  ) {
    return this.svc.reject(id, body.note);
  }

  @Get('documents/pending-approval')
  @ApiOperation({ summary: 'List documents pending approval for an organization' })
  @ApiQuery({ name: 'organizationId', required: true, type: Number })
  listPendingApproval(@Query('organizationId') organizationId: string) {
    return this.svc.findAll(parseInt(organizationId, 10), 'pending_approval');
  }

  @Post('documents/:id/send')
  @ApiOperation({ summary: 'Mark document as sent and create registry entry' })
  send(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { sentMethod?: string },
  ) {
    return this.svc.send(id, body?.sentMethod);
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
  @ApiOperation({ summary: 'V2: Generate AI draft from inbound case' })
  generateAiDraft(@Body() dto: {
    caseId: number;
    draftType: string;
    additionalContext?: string;
  }) {
    return this.svc.generateAiDraft(dto.caseId, dto.draftType, dto.additionalContext);
  }

  @Post('ai-generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'V3: Generate outbound document from user prompt' })
  generateFromPrompt(
    @CurrentUser() user: any,
    @Body() dto: {
      letterType: string;
      prompt: string;
    },
  ) {
    return this.svc.generateFromPrompt({
      organizationId: Number(user.organizationId),
      userId: Number(user.id),
      letterType: dto.letterType,
      prompt: dto.prompt,
    });
  }

  @Post('registry/inbound/:caseId')
  @ApiOperation({ summary: 'Create inbound registry entry for a case' })
  registerInbound(@Param('caseId', ParseIntPipe) caseId: number) {
    return this.svc.registerInbound(caseId);
  }
}
