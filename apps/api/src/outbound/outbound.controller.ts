import { Controller, Get, Post, Param, Body, Query, Res, ParseIntPipe, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { OutboundService } from './outbound.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('outbound')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('outbound')
export class OutboundController {
  constructor(private readonly svc: OutboundService) {}

  private assertSameOrg(user: any, organizationId: number) {
    if (Number(user?.organizationId) !== Number(organizationId)) {
      throw new ForbiddenException('ไม่สามารถเข้าถึงข้อมูลขององค์กรอื่น');
    }
  }

  @Get(':organizationId/documents')
  @ApiOperation({ summary: 'List outbound documents for an organization' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'letterType', required: false })
  listDocuments(
    @CurrentUser() user: any,
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('status') status?: string,
    @Query('letterType') letterType?: string,
  ) {
    this.assertSameOrg(user, organizationId);
    return this.svc.findAll(organizationId, status, letterType, user?.roleCode);
  }

  @Get('my/documents')
  @ApiOperation({ summary: 'List outbound documents for the current user organization (no orgId required)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'letterType', required: false })
  listMyDocuments(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('letterType') letterType?: string,
  ) {
    return this.svc.findAll(Number(user?.organizationId), status, letterType, user?.roleCode);
  }

  @Get('my/registry')
  @ApiOperation({ summary: 'Get outbound registry (ทะเบียนส่ง) for the current user organization' })
  @ApiQuery({ name: 'academicYearId', required: false, type: Number })
  getMyRegistry(
    @CurrentUser() user: any,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.svc.getRegistry(
      Number(user?.organizationId),
      'outbound',
      academicYearId ? parseInt(academicYearId, 10) : undefined,
    );
  }

  @Get('documents/pending-approval')
  @ApiOperation({ summary: 'List documents pending approval for an organization' })
  @ApiQuery({ name: 'organizationId', required: true, type: Number })
  listPendingApproval(
    @CurrentUser() user: any,
    @Query('organizationId') organizationId: string,
  ) {
    const orgId = parseInt(organizationId, 10);
    this.assertSameOrg(user, orgId);
    return this.svc.findAll(orgId, 'pending_approval', undefined, user?.roleCode);
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Get outbound document by ID' })
  getDocument(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(id, user?.roleCode, Number(user?.organizationId));
  }

  @Get('documents/:id/pdf')
  @ApiOperation({ summary: 'Generate and download PDF for outbound document' })
  async getPdf(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const buffer = await this.svc.generatePdf(id, Number(user?.organizationId));
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="outbound-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('documents/:id/word')
  @ApiOperation({ summary: 'Generate and download Word (.docx) for outbound document' })
  async getWord(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const buffer = await this.svc.generatePdf(id, Number(user?.organizationId));
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="outbound-${id}.docx"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post('documents')
  @ApiOperation({ summary: 'Create a draft outbound document' })
  create(
    @CurrentUser() user: any,
    @Body() dto: {
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
    },
  ) {
    return this.svc.create({
      ...dto,
      organizationId: Number(user?.organizationId),
      createdByUserId: Number(user?.id),
    });
  }

  @Post('documents/:id/approve')
  @ApiOperation({ summary: 'Approve document and assign document number' })
  approve(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.approve(id, Number(user?.id), Number(user?.organizationId));
  }

  @Post('documents/:id/reject')
  @ApiOperation({ summary: 'Reject (return to draft) outbound document' })
  reject(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { note?: string },
  ) {
    return this.svc.reject(id, body.note, Number(user?.organizationId));
  }

  @Post('documents/:id/send')
  @ApiOperation({ summary: 'Mark document as sent and create registry entry' })
  send(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { sentMethod?: string },
  ) {
    return this.svc.send(id, body?.sentMethod, Number(user?.organizationId));
  }

  @Get(':organizationId/registry')
  @ApiOperation({ summary: 'Get document registry (ทะเบียน)' })
  @ApiQuery({ name: 'type', required: false, description: 'inbound | outbound | archive | destroy' })
  @ApiQuery({ name: 'academicYearId', required: false, type: Number })
  getRegistry(
    @CurrentUser() user: any,
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('type') registryType?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    this.assertSameOrg(user, organizationId);
    return this.svc.getRegistry(
      organizationId,
      registryType,
      academicYearId ? parseInt(academicYearId, 10) : undefined,
    );
  }

  @Post('ai-draft')
  @ApiOperation({ summary: 'V2: Generate AI draft from inbound case' })
  generateAiDraft(
    @CurrentUser() user: any,
    @Body() dto: {
      caseId: number;
      draftType: string;
      additionalContext?: string;
    },
  ) {
    return this.svc.generateAiDraft(dto.caseId, dto.draftType, dto.additionalContext, Number(user?.organizationId));
  }

  @Post('ai-generate')
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
  registerInbound(
    @CurrentUser() user: any,
    @Param('caseId', ParseIntPipe) caseId: number,
  ) {
    return this.svc.registerInbound(caseId, Number(user?.organizationId));
  }
}
