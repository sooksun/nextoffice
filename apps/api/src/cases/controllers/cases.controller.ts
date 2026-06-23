import { Controller, Get, Post, Patch, Put, Param, Query, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { CasesService } from '../services/cases.service';
import { CaseWorkflowService } from '../services/case-workflow.service';
import { SmartRoutingService } from '../../notifications/smart-routing.service';
import { PredictiveWorkflowService } from '../../ai/services/predictive-workflow.service';
import { DraftGeneratorService } from '../../ai/services/draft-generator.service';
import { PolicyAlignmentService } from '../../rag/services/policy-alignment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  CreateManualCaseDto,
  AssignCaseDto,
  UpdateCaseStatusDto,
  DirectorSignDto,
} from '../dto/case-actions.dto';

@ApiTags('cases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cases')
export class CasesController {
  constructor(
    private readonly svc: CasesService,
    private readonly workflow: CaseWorkflowService,
    private readonly smartRouting: SmartRoutingService,
    private readonly predictive: PredictiveWorkflowService,
    private readonly draftGen: DraftGeneratorService,
    private readonly policyAlignment: PolicyAlignmentService,
  ) {}

  private assertCaseAccess(id: number, user: any): Promise<void> {
    if (!user) return Promise.resolve();
    return this.svc.assertCaseInOrganization(id, Number(user.organizationId), user.roleCode);
  }

  @Get()
  @ApiOperation({ summary: 'List cases with filters' })
  @ApiQuery({ name: 'organizationId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'urgencyLevel', required: false })
  @ApiQuery({ name: 'assignedToUserId', required: false, type: Number })
  @ApiQuery({ name: 'academicYearId', required: false, type: Number })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'responseRequiredOnly', required: false, description: 'true = เฉพาะหนังสือที่ต้องการตอบสนอง' })
  @ApiQuery({ name: 'includeReplied', required: false, description: 'false = ตัดหนังสือที่ตอบไปแล้ว' })
  listCases(
    @CurrentUser() user: any,
    @Query('organizationId') orgId?: string,
    @Query('status') status?: string,
    @Query('urgencyLevel') urgencyLevel?: string,
    @Query('assignedToUserId') assignedToUserId?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('responseRequiredOnly') responseRequiredOnly?: string,
    @Query('includeReplied') includeReplied?: string,
  ) {
    // ADMIN can query any org; other roles are locked to their own org
    const effectiveOrgId = user.roleCode === 'ADMIN' && orgId
      ? Number(orgId)
      : Number(user.organizationId);
    return this.svc.listCases({
      organizationId: effectiveOrgId,
      status,
      urgencyLevel,
      assignedToUserId: assignedToUserId ? Number(assignedToUserId) : undefined,
      academicYearId: academicYearId ? Number(academicYearId) : undefined,
      dateFrom,
      dateTo,
      search,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
      responseRequiredOnly: responseRequiredOnly === 'true',
      includeReplied: includeReplied === undefined ? undefined : includeReplied !== 'false',
    });
  }

  @Get('overdue')
  @ApiOperation({ summary: 'งานค้าง (เกิน deadline)' })
  @ApiQuery({ name: 'organizationId', required: false, type: Number, description: 'ADMIN เท่านั้นที่ระบุ org อื่นได้' })
  getOverdue(
    @CurrentUser() userOrOrgId: any,
    @Query('organizationId') maybeOrgId?: string,
  ) {
    const user = typeof userOrOrgId === 'object' ? userOrOrgId : undefined;
    const orgId = user ? maybeOrgId : userOrOrgId;
    const effectiveOrgId = user
      ? (user.roleCode === 'ADMIN' && orgId ? Number(orgId) : Number(user.organizationId))
      : (orgId ? Number(orgId) : undefined);
    return this.svc.getOverdue(effectiveOrgId);
  }

  @Get('my-tasks')
  @ApiOperation({ summary: 'งานที่ฉันต้องทำ เรียงตามความเร่งด่วน' })
  getMyTasks(@CurrentUser() user: any) {
    return this.svc.getMyTasks(Number(user.id));
  }

  @Get('school-pending')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'HEAD_TEACHER', 'CLERK')
  @ApiOperation({ summary: 'ภาพรวมงานทั้งโรงเรียน (เจ้าหน้าที่/ผู้บริหาร)' })
  getSchoolPending(@CurrentUser() user: any) {
    return this.svc.getSchoolPending(Number(user.organizationId));
  }

  @Post('from-intake/:documentIntakeId')
  @ApiOperation({ summary: 'Create case from a classified document intake' })
  createFromIntake(
    @Param('documentIntakeId', ParseIntPipe) documentIntakeId: number,
    @CurrentUser() user?: any,
  ) {
    return this.svc.createFromIntake(
      documentIntakeId,
      user ? Number(user.organizationId) : undefined,
      user?.roleCode,
    );
  }

  @Post('manual')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'CLERK', 'DIRECTOR', 'VICE_DIRECTOR')
  @ApiOperation({ summary: 'สร้างเอกสารเข้าด้วยมือ (ไม่ผ่าน AI pipeline)' })
  createManual(
    @CurrentUser() user: any,
    @Body() body: CreateManualCaseDto,
  ) {
    return this.svc.createManual({
      ...body,
      organizationId: Number(user.organizationId),
      createdByUserId: Number(user.id),
    });
  }

  // ─── Director Signing (must be before :id routes) ───

  @Get('pending-director-signing')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR', 'VICE_DIRECTOR', 'ADMIN')
  @ApiOperation({ summary: 'รายการหนังสือรอ ผอ. ลงนาม (Stamp 3)' })
  getPendingDirectorSigning(@CurrentUser() user: any) {
    return this.svc.getPendingDirectorSigning(Number(user.organizationId));
  }

  @Post(':id/director-sign')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR', 'VICE_DIRECTOR', 'ADMIN')
  @ApiOperation({ summary: 'ผอ. ลงนามเกษียณหนังสือ (ประทับ Stamp 3)' })
  async directorSign(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: DirectorSignDto,
  ) {
    // Block cross-tenant signing — applyDirectorStampAsync itself is org-agnostic.
    await this.assertCaseAccess(id, user);
    let signatureBuffer: Buffer | undefined;
    if (body.signatureMethod === 'pad' && body.signatureBase64) {
      // Decode base64 PNG from signature pad
      const base64Data = body.signatureBase64.replace(/^data:image\/\w+;base64,/, '');
      signatureBuffer = Buffer.from(base64Data, 'base64');
    }
    // If electronic, applyDirectorStampAsync loads from User.signaturePath
    await this.workflow.applyDirectorStampAsync(
      id,
      Number(user.id),
      body.noteText,
      signatureBuffer,
    );
    return this.svc.findById(id, Number(user.organizationId), user.roleCode);
  }

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'CLERK')
  @ApiOperation({ summary: 'จัดเก็บเรื่องที่ดำเนินการเสร็จแล้ว (completed → archived)' })
  archiveCase(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.workflow.archiveCase(id, Number(user.id), Number(user.organizationId));
  }

  @Get(':id/tracking')
  @ApiOperation({ summary: 'สถานะรับทราบ/ดำเนินการ รายบุคคล' })
  getTracking(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.workflow.getTrackingData(id, Number(user.organizationId), user.roleCode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get case by ID' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.findById(id, Number(user.organizationId), user.roleCode);
  }

  @Get(':id/options')
  @ApiOperation({ summary: 'Get AI-generated options for a case' })
  getOptions(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.getOptions(id, Number(user.organizationId), user.roleCode);
  }

  @Get(':id/policy-alignment')
  @ApiOperation({ summary: 'V2 Phase 4: คะแนนความสอดคล้องกับนโยบาย' })
  async getPolicyAlignment(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: any) {
    if (user) await this.assertCaseAccess(id, user);
    return this.policyAlignment.getAlignmentForCase(id);
  }

  // ─── Workflow endpoints ───

  @Post(':id/register')
  @UseGuards(RolesGuard)
  @Roles('CLERK', 'DIRECTOR', 'VICE_DIRECTOR')
  @ApiOperation({ summary: 'ลงทะเบียนรับหนังสือ (ได้เลขรับอัตโนมัติ) — ADMIN ไม่สามารถลงรับได้' })
  register(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.workflow.register(id, Number(user.id));
  }

  @Post(':id/assign')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'CLERK')
  @ApiOperation({ summary: 'มอบหมายงาน + เกษียณหนังสือ (ผอ./รอง ผอ./ธุรการ)' })
  assign(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: AssignCaseDto,
  ) {
    return this.workflow.assign(
      id,
      Number(user.id),
      body.assignments,
      body.directorNote,
      body.selectedOptionId,
      user.roleCode,
      body.clerkOpinion,
      body.routingPath,
    );
  }

  @Get(':id/endorsements')
  @ApiOperation({ summary: 'ดู endorsement chain ของ case' })
  async getEndorsements(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: any) {
    if (user) await this.assertCaseAccess(id, user);
    return this.workflow.getEndorsements(id);
  }

  @Put(':id/endorsements/:eid')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR', 'VICE_DIRECTOR', 'CLERK')
  @ApiOperation({ summary: 'แก้ไขความเห็น/เกษียณ (เจ้าของ endorsement เท่านั้น)' })
  updateEndorsement(
    @Param('id', ParseIntPipe) id: number,
    @Param('eid', ParseIntPipe) eid: number,
    @CurrentUser() user: any,
    @Body() body: { noteText: string },
  ) {
    return this.workflow.updateEndorsement(eid, Number(user.id), body.noteText, user.roleCode);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'เปลี่ยนสถานะ case' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: UpdateCaseStatusDto,
  ) {
    return this.workflow.updateStatus(id, body.status, Number(user.id), Number(user.organizationId));
  }

  @Get(':id/assignments')
  @ApiOperation({ summary: 'ดูรายการมอบหมายงานของ case' })
  async getAssignments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: any) {
    if (user) await this.assertCaseAccess(id, user);
    return this.workflow.getAssignments(id);
  }

  @Patch('assignments/:assignmentId/status')
  @ApiOperation({ summary: 'อัปเดตสถานะงานที่ได้รับมอบหมาย' })
  updateAssignmentStatus(
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @CurrentUser() user: any,
    @Body() body: UpdateCaseStatusDto,
  ) {
    return this.workflow.updateAssignmentStatus(assignmentId, body.status, Number(user.id), Number(user.organizationId));
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'ดู activity log ของ case' })
  async getActivities(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: any) {
    if (user) await this.assertCaseAccess(id, user);
    return this.workflow.getActivities(id);
  }

  @Post(':id/progress-report')
  @ApiOperation({ summary: 'รายงานความคืบหน้างาน (auto-update assignment status → in_progress)' })
  addProgressReport(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: { reportText: string },
  ) {
    return this.workflow.addProgressReport(id, Number(user.id), body.reportText);
  }

  @Post(':id/assign-recommend')
  @ApiOperation({ summary: 'AI แนะนำการมอบหมายงาน + คำสั่งผู้บริหาร (RAG + Gemini)' })
  async recommendAssignment(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: any) {
    if (user) await this.assertCaseAccess(id, user);
    return this.svc.recommendAssignment(id);
  }

  @Get(':id/routing-suggestion')
  @ApiOperation({ summary: 'AI แนะนำกลุ่มงาน + ผู้รับผิดชอบจากหัวเรื่องหนังสือ' })
  async getRoutingSuggestion(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: any) {
    if (user) await this.assertCaseAccess(id, user);
    return this.smartRouting.applyRoutingToCase(id);
  }

  @Post(':id/apply-routing')
  @ApiOperation({ summary: 'ใช้ smart routing มอบหมายผู้รับผิดชอบอัตโนมัติ' })
  async applyRouting(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: any) {
    if (user) await this.assertCaseAccess(id, user);
    return this.smartRouting.applyRoutingToCase(id);
  }

  // ─── V2: Predictions ────────────────────────

  @Get(':id/predictions')
  @ApiOperation({ summary: 'V2: ดู AI predictions ของ case (ทำนาย next steps, risks, deadlines)' })
  async getPredictions(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: any) {
    if (user) await this.assertCaseAccess(id, user);
    return this.predictive.getPredictions(BigInt(id));
  }

  @Post(':id/predictions/:predictionId/feedback')
  @ApiOperation({ summary: 'V2: ตอบรับ/ปฏิเสธ prediction' })
  async submitPredictionFeedback(
    @Param('id', ParseIntPipe) id: number,
    @Param('predictionId', ParseIntPipe) predictionId: number,
    @Body() body: { accepted: boolean },
    @CurrentUser() user?: any,
  ) {
    if (user) {
      await this.assertCaseAccess(id, user);
      return this.predictive.submitFeedback(BigInt(predictionId), body.accepted, BigInt(id));
    }
    return this.predictive.submitFeedback(BigInt(predictionId), body.accepted);
  }

  // ─── V2: AI Draft Generator ─────────────────

  @Post(':id/draft')
  @ApiOperation({ summary: 'V2: สร้างร่างเอกสาร (บันทึกเสนอ, หนังสือตอบ, รายงานผล)' })
  @ApiQuery({ name: 'type', required: false, description: 'memo | reply_letter | report | assignment_order' })
  async generateDraft(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() userOrBody?: any,
    @Body() maybeBody?: { draftType?: string; additionalContext?: string },
  ) {
    const user = maybeBody === undefined ? undefined : userOrBody;
    const body = (maybeBody ?? userOrBody ?? {}) as { draftType?: string; additionalContext?: string };
    if (user) await this.assertCaseAccess(id, user);
    return this.draftGen.generateDraft(
      BigInt(id),
      body.draftType || 'memo',
      body.additionalContext,
    );
  }
}
