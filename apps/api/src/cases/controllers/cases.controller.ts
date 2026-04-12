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
  listCases(
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
  ) {
    return this.svc.listCases({
      organizationId: orgId ? Number(orgId) : undefined,
      status,
      urgencyLevel,
      assignedToUserId: assignedToUserId ? Number(assignedToUserId) : undefined,
      academicYearId: academicYearId ? Number(academicYearId) : undefined,
      dateFrom,
      dateTo,
      search,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('overdue')
  @ApiOperation({ summary: 'งานค้าง (เกิน deadline)' })
  @ApiQuery({ name: 'organizationId', required: false, type: Number })
  getOverdue(@Query('organizationId') orgId?: string) {
    return this.svc.getOverdue(orgId ? Number(orgId) : undefined);
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
  createFromIntake(@Param('documentIntakeId', ParseIntPipe) documentIntakeId: number) {
    return this.svc.createFromIntake(documentIntakeId);
  }

  @Post('manual')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'CLERK', 'DIRECTOR', 'VICE_DIRECTOR')
  @ApiOperation({ summary: 'สร้างเอกสารเข้าด้วยมือ (ไม่ผ่าน AI pipeline)' })
  createManual(
    @CurrentUser() user: any,
    @Body() body: {
      title: string;
      description?: string;
      documentNo?: string;
      documentDate?: string;
      senderOrg?: string;
      recipientNote?: string;
      urgencyLevel?: string;
      dueDate?: string;
      intakeId?: number;
    },
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
    @Body() body: {
      noteText: string;
      signatureMethod: 'pad' | 'electronic';
      signatureBase64?: string;
    },
  ) {
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
    return this.svc.findById(id);
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

  @Get(':id/policy-alignment')
  @ApiOperation({ summary: 'V2 Phase 4: คะแนนความสอดคล้องกับนโยบาย' })
  getPolicyAlignment(@Param('id', ParseIntPipe) id: number) {
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
    @Body() body: {
      assignments: { userId: number; role?: string; dueDate?: string; note?: string }[];
      directorNote?: string;
      selectedOptionId?: number;
      clerkOpinion?: string;
      routingPath?: 'direct' | 'via_vice';
    },
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
  getEndorsements(@Param('id', ParseIntPipe) id: number) {
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
    @Body() body: { status: string },
  ) {
    return this.workflow.updateStatus(id, body.status, Number(user.id));
  }

  @Get(':id/assignments')
  @ApiOperation({ summary: 'ดูรายการมอบหมายงานของ case' })
  getAssignments(@Param('id', ParseIntPipe) id: number) {
    return this.workflow.getAssignments(id);
  }

  @Patch('assignments/:assignmentId/status')
  @ApiOperation({ summary: 'อัปเดตสถานะงานที่ได้รับมอบหมาย' })
  updateAssignmentStatus(
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @CurrentUser() user: any,
    @Body() body: { status: string },
  ) {
    return this.workflow.updateAssignmentStatus(assignmentId, body.status, Number(user.id));
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'ดู activity log ของ case' })
  getActivities(@Param('id', ParseIntPipe) id: number) {
    return this.workflow.getActivities(id);
  }

  @Post(':id/assign-recommend')
  @ApiOperation({ summary: 'AI แนะนำการมอบหมายงาน + คำสั่งผู้บริหาร (RAG + Gemini)' })
  recommendAssignment(@Param('id', ParseIntPipe) id: number) {
    return this.svc.recommendAssignment(id);
  }

  @Get(':id/routing-suggestion')
  @ApiOperation({ summary: 'AI แนะนำกลุ่มงาน + ผู้รับผิดชอบจากหัวเรื่องหนังสือ' })
  getRoutingSuggestion(@Param('id', ParseIntPipe) id: number) {
    return this.smartRouting.applyRoutingToCase(id);
  }

  @Post(':id/apply-routing')
  @ApiOperation({ summary: 'ใช้ smart routing มอบหมายผู้รับผิดชอบอัตโนมัติ' })
  applyRouting(@Param('id', ParseIntPipe) id: number) {
    return this.smartRouting.applyRoutingToCase(id);
  }

  // ─── V2: Predictions ────────────────────────

  @Get(':id/predictions')
  @ApiOperation({ summary: 'V2: ดู AI predictions ของ case (ทำนาย next steps, risks, deadlines)' })
  getPredictions(@Param('id', ParseIntPipe) id: number) {
    return this.predictive.getPredictions(BigInt(id));
  }

  @Post(':id/predictions/:predictionId/feedback')
  @ApiOperation({ summary: 'V2: ตอบรับ/ปฏิเสธ prediction' })
  submitPredictionFeedback(
    @Param('id', ParseIntPipe) _id: number,
    @Param('predictionId', ParseIntPipe) predictionId: number,
    @Body() body: { accepted: boolean },
  ) {
    return this.predictive.submitFeedback(BigInt(predictionId), body.accepted);
  }

  // ─── V2: AI Draft Generator ─────────────────

  @Post(':id/draft')
  @ApiOperation({ summary: 'V2: สร้างร่างเอกสาร (บันทึกเสนอ, หนังสือตอบ, รายงานผล)' })
  @ApiQuery({ name: 'type', required: false, description: 'memo | reply_letter | report | assignment_order' })
  generateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { draftType?: string; additionalContext?: string },
  ) {
    return this.draftGen.generateDraft(
      BigInt(id),
      body.draftType || 'memo',
      body.additionalContext,
    );
  }
}
