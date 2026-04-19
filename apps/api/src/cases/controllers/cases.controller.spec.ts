import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { CasesController } from './cases.controller';
import { CasesService } from '../services/cases.service';
import { CaseWorkflowService } from '../services/case-workflow.service';
import { SmartRoutingService } from '../../notifications/smart-routing.service';
import { PredictiveWorkflowService } from '../../ai/services/predictive-workflow.service';
import { DraftGeneratorService } from '../../ai/services/draft-generator.service';
import { PolicyAlignmentService } from '../../rag/services/policy-alignment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

const mockGuard = { canActivate: (_ctx: ExecutionContext) => true };

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockCasesService = {
  listCases: jest.fn(),
  getOverdue: jest.fn(),
  getMyTasks: jest.fn(),
  getSchoolPending: jest.fn(),
  createFromIntake: jest.fn(),
  createManual: jest.fn(),
  findById: jest.fn(),
  getOptions: jest.fn(),
  recommendAssignment: jest.fn(),
  getPendingDirectorSigning: jest.fn(),
};

const mockWorkflow = {
  register: jest.fn(),
  assign: jest.fn(),
  updateStatus: jest.fn(),
  getAssignments: jest.fn(),
  updateAssignmentStatus: jest.fn(),
  getActivities: jest.fn(),
  getEndorsements: jest.fn(),
  updateEndorsement: jest.fn(),
  addProgressReport: jest.fn(),
  getTrackingData: jest.fn(),
  applyDirectorStampAsync: jest.fn(),
};

const mockSmartRouting = { applyRoutingToCase: jest.fn() };
const mockPredictive = { getPredictions: jest.fn(), submitFeedback: jest.fn() };
const mockDraftGen = { generateDraft: jest.fn() };
const mockPolicyAlignment = { getAlignmentForCase: jest.fn() };

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('CasesController', () => {
  let controller: CasesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CasesController],
      providers: [
        { provide: CasesService, useValue: mockCasesService },
        { provide: CaseWorkflowService, useValue: mockWorkflow },
        { provide: SmartRoutingService, useValue: mockSmartRouting },
        { provide: PredictiveWorkflowService, useValue: mockPredictive },
        { provide: DraftGeneratorService, useValue: mockDraftGen },
        { provide: PolicyAlignmentService, useValue: mockPolicyAlignment },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue(mockGuard)
      .overrideGuard(RolesGuard).useValue(mockGuard)
      .compile();

    controller = module.get<CasesController>(CasesController);
  });

  // ─── listCases() ─────────────────────────────────────────────────────────

  describe('listCases()', () => {
    it('converts string query params to numbers and passes them correctly', () => {
      mockCasesService.listCases.mockReturnValue([]);
      controller.listCases('1', 'proposed', undefined, undefined, undefined, undefined, undefined, undefined, '20', '0');
      expect(mockCasesService.listCases).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 1, status: 'proposed', take: 20, skip: 0 }),
      );
    });

    it('passes undefined when optional query params are omitted', () => {
      mockCasesService.listCases.mockReturnValue([]);
      controller.listCases();
      expect(mockCasesService.listCases).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: undefined, take: undefined }),
      );
    });

    it('passes responseRequiredOnly=true when query param is "true"', () => {
      mockCasesService.listCases.mockReturnValue([]);
      controller.listCases(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'true');
      expect(mockCasesService.listCases).toHaveBeenCalledWith(
        expect.objectContaining({ responseRequiredOnly: true }),
      );
    });
  });

  // ─── getMyTasks() ────────────────────────────────────────────────────────

  describe('getMyTasks()', () => {
    it('calls service with user id converted to number', () => {
      mockCasesService.getMyTasks.mockReturnValue([]);
      controller.getMyTasks({ id: '3' });
      expect(mockCasesService.getMyTasks).toHaveBeenCalledWith(3);
    });
  });

  // ─── getSchoolPending() ──────────────────────────────────────────────────

  describe('getSchoolPending()', () => {
    it('calls service with organizationId from current user', () => {
      mockCasesService.getSchoolPending.mockReturnValue([]);
      controller.getSchoolPending({ organizationId: '10' });
      expect(mockCasesService.getSchoolPending).toHaveBeenCalledWith(10);
    });
  });

  // ─── getOverdue() ────────────────────────────────────────────────────────

  describe('getOverdue()', () => {
    it('passes numeric orgId when provided', () => {
      mockCasesService.getOverdue.mockReturnValue([]);
      controller.getOverdue('5');
      expect(mockCasesService.getOverdue).toHaveBeenCalledWith(5);
    });

    it('passes undefined when orgId is omitted', () => {
      mockCasesService.getOverdue.mockReturnValue([]);
      controller.getOverdue(undefined);
      expect(mockCasesService.getOverdue).toHaveBeenCalledWith(undefined);
    });
  });

  // ─── register() ──────────────────────────────────────────────────────────

  describe('register()', () => {
    it('delegates to workflow.register with parsed caseId and userId', async () => {
      mockWorkflow.register.mockResolvedValue({ id: 1, status: 'registered', registrationNo: '001/2568' });
      const result = await controller.register(1, { id: '5' });
      expect(mockWorkflow.register).toHaveBeenCalledWith(1, 5);
      expect(result.registrationNo).toBe('001/2568');
    });
  });

  // ─── assign() ────────────────────────────────────────────────────────────

  describe('assign()', () => {
    it('passes all body fields including roleCode, clerkOpinion, and routingPath', async () => {
      mockWorkflow.assign.mockResolvedValue({ ok: true });
      const user = { id: '1', roleCode: 'CLERK', organizationId: '10' };
      const body = {
        assignments: [{ userId: 3, role: 'responsible' }],
        directorNote: 'เร่งด่วน',
        selectedOptionId: 2,
        clerkOpinion: 'ความเห็นธุรการ',
        routingPath: 'direct' as const,
      };

      await controller.assign(10, user, body);

      expect(mockWorkflow.assign).toHaveBeenCalledWith(
        10, 1, body.assignments, 'เร่งด่วน', 2, 'CLERK', 'ความเห็นธุรการ', 'direct',
      );
    });

    it('passes undefined for optional fields when not provided in body', async () => {
      mockWorkflow.assign.mockResolvedValue({ ok: true });
      const user = { id: '1', roleCode: 'DIRECTOR', organizationId: '10' };
      const body = { assignments: [{ userId: 3 }] };

      await controller.assign(5, user, body);

      expect(mockWorkflow.assign).toHaveBeenCalledWith(
        5, 1, body.assignments, undefined, undefined, 'DIRECTOR', undefined, undefined,
      );
    });
  });

  // ─── updateStatus() ──────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('passes userId AND organizationId to workflow.updateStatus', async () => {
      mockWorkflow.updateStatus.mockResolvedValue({ status: 'assigned' });
      await controller.updateStatus(1, { id: '2', organizationId: '10' }, { status: 'assigned' });
      expect(mockWorkflow.updateStatus).toHaveBeenCalledWith(1, 'assigned', 2, 10);
    });

    it('returns the result from workflow.updateStatus', async () => {
      const expected = { id: 1, status: 'in_progress' };
      mockWorkflow.updateStatus.mockResolvedValue(expected);
      const result = await controller.updateStatus(1, { id: '1', organizationId: '1' }, { status: 'in_progress' });
      expect(result).toEqual(expected);
    });
  });

  // ─── getAssignments() ────────────────────────────────────────────────────

  describe('getAssignments()', () => {
    it('delegates to workflow.getAssignments with case id', () => {
      mockWorkflow.getAssignments.mockResolvedValue([]);
      controller.getAssignments(42);
      expect(mockWorkflow.getAssignments).toHaveBeenCalledWith(42);
    });
  });

  // ─── updateAssignmentStatus() ────────────────────────────────────────────

  describe('updateAssignmentStatus()', () => {
    it('passes assignmentId, status, userId, AND organizationId to workflow', async () => {
      mockWorkflow.updateAssignmentStatus.mockResolvedValue({ status: 'accepted' });
      await controller.updateAssignmentStatus(55, { id: '3', organizationId: '10' }, { status: 'accepted' });
      expect(mockWorkflow.updateAssignmentStatus).toHaveBeenCalledWith(55, 'accepted', 3, 10);
    });

    it('returns the result from workflow.updateAssignmentStatus', async () => {
      const expected = { id: 55, status: 'completed', completedAt: new Date() };
      mockWorkflow.updateAssignmentStatus.mockResolvedValue(expected);
      const result = await controller.updateAssignmentStatus(55, { id: '3', organizationId: '10' }, { status: 'completed' });
      expect(result).toEqual(expected);
    });
  });

  // ─── getActivities() ─────────────────────────────────────────────────────

  describe('getActivities()', () => {
    it('delegates to workflow.getActivities with case id', () => {
      mockWorkflow.getActivities.mockResolvedValue([]);
      controller.getActivities(7);
      expect(mockWorkflow.getActivities).toHaveBeenCalledWith(7);
    });
  });

  // ─── getTracking() ───────────────────────────────────────────────────────

  describe('getTracking()', () => {
    it('delegates to workflow.getTrackingData with org boundary args', async () => {
      const tracking = { case: { id: 1, status: 'assigned' }, assignments: [], summary: {} };
      mockWorkflow.getTrackingData.mockResolvedValue(tracking);
      const user = { id: '5', organizationId: '10', roleCode: 'CLERK' };

      const result = await controller.getTracking(1, user);

      expect(mockWorkflow.getTrackingData).toHaveBeenCalledWith(1, 10, 'CLERK');
      expect(result).toEqual(tracking);
    });
  });

  // ─── getEndorsements() ───────────────────────────────────────────────────

  describe('getEndorsements()', () => {
    it('delegates to workflow.getEndorsements with case id', () => {
      mockWorkflow.getEndorsements.mockResolvedValue([]);
      controller.getEndorsements(10);
      expect(mockWorkflow.getEndorsements).toHaveBeenCalledWith(10);
    });
  });

  // ─── updateEndorsement() ─────────────────────────────────────────────────

  describe('updateEndorsement()', () => {
    it('passes endorsement id, user id, noteText, and roleCode to workflow', async () => {
      mockWorkflow.updateEndorsement.mockResolvedValue({ id: 3, noteText: 'แก้ไขแล้ว' });
      const user = { id: '5', roleCode: 'DIRECTOR' };

      await controller.updateEndorsement(1, 3, user, { noteText: 'แก้ไขแล้ว' });

      expect(mockWorkflow.updateEndorsement).toHaveBeenCalledWith(3, 5, 'แก้ไขแล้ว', 'DIRECTOR');
    });
  });

  // ─── addProgressReport() ─────────────────────────────────────────────────

  describe('addProgressReport()', () => {
    it('delegates to workflow.addProgressReport with case id, user id, and reportText', async () => {
      mockWorkflow.addProgressReport.mockResolvedValue({ success: true });
      const user = { id: '3' };

      await controller.addProgressReport(1, user, { reportText: 'ดำเนินการแล้ว' });

      expect(mockWorkflow.addProgressReport).toHaveBeenCalledWith(1, 3, 'ดำเนินการแล้ว');
    });
  });

  // ─── directorSign() ──────────────────────────────────────────────────────

  describe('directorSign()', () => {
    it('decodes base64 and passes Buffer for pad signature method', async () => {
      const fakeBase64 = Buffer.from('fake-png-data').toString('base64');
      mockWorkflow.applyDirectorStampAsync.mockResolvedValue(undefined);
      mockCasesService.findById.mockResolvedValue({ id: 1 });

      await controller.directorSign(1, { id: '5' }, {
        noteText: 'เห็นชอบ',
        signatureMethod: 'pad',
        signatureBase64: `data:image/png;base64,${fakeBase64}`,
      });

      expect(mockWorkflow.applyDirectorStampAsync).toHaveBeenCalledWith(
        1, 5, 'เห็นชอบ', expect.any(Buffer),
      );
    });

    it('passes undefined signatureBuffer for electronic signature method', async () => {
      mockWorkflow.applyDirectorStampAsync.mockResolvedValue(undefined);
      mockCasesService.findById.mockResolvedValue({ id: 1 });

      await controller.directorSign(1, { id: '5' }, {
        noteText: 'เห็นชอบ',
        signatureMethod: 'electronic',
      });

      expect(mockWorkflow.applyDirectorStampAsync).toHaveBeenCalledWith(1, 5, 'เห็นชอบ', undefined);
    });

    it('returns the case from findById after signing', async () => {
      const caseResult = { id: 1, status: 'assigned', directorStampStatus: 'applied' };
      mockWorkflow.applyDirectorStampAsync.mockResolvedValue(undefined);
      mockCasesService.findById.mockResolvedValue(caseResult);

      const result = await controller.directorSign(1, { id: '5' }, {
        noteText: 'เห็นชอบ',
        signatureMethod: 'electronic',
      });

      expect(result).toEqual(caseResult);
    });
  });

  // ─── getPendingDirectorSigning() ─────────────────────────────────────────

  describe('getPendingDirectorSigning()', () => {
    it('delegates to svc.getPendingDirectorSigning with parsed organizationId', () => {
      mockCasesService.getPendingDirectorSigning.mockResolvedValue([]);
      controller.getPendingDirectorSigning({ organizationId: '10' });
      expect(mockCasesService.getPendingDirectorSigning).toHaveBeenCalledWith(10);
    });
  });

  // ─── recommendAssignment() ───────────────────────────────────────────────

  describe('recommendAssignment()', () => {
    it('delegates to svc.recommendAssignment with case id', () => {
      mockCasesService.recommendAssignment.mockResolvedValue({ recommendation: '...' });
      controller.recommendAssignment(5);
      expect(mockCasesService.recommendAssignment).toHaveBeenCalledWith(5);
    });
  });

  // ─── generateDraft() ─────────────────────────────────────────────────────

  describe('generateDraft()', () => {
    it('defaults draftType to "memo" when not provided', async () => {
      mockDraftGen.generateDraft.mockResolvedValue({ draft: '...' });
      await controller.generateDraft(1, {});
      expect(mockDraftGen.generateDraft).toHaveBeenCalledWith(BigInt(1), 'memo', undefined);
    });

    it('uses provided draftType and additionalContext', async () => {
      mockDraftGen.generateDraft.mockResolvedValue({ draft: '...' });
      await controller.generateDraft(1, { draftType: 'reply_letter', additionalContext: 'ctx' });
      expect(mockDraftGen.generateDraft).toHaveBeenCalledWith(BigInt(1), 'reply_letter', 'ctx');
    });
  });

  // ─── createManual() ──────────────────────────────────────────────────────

  describe('createManual()', () => {
    it('injects organizationId and createdByUserId from current user', async () => {
      mockCasesService.createManual.mockResolvedValue({ caseId: 1, status: 'created' });
      const user = { id: '7', organizationId: '10' };
      const body = { title: 'หนังสือทดสอบ', senderOrg: 'สพม.1' };

      await controller.createManual(user, body);

      expect(mockCasesService.createManual).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 10, createdByUserId: 7, title: 'หนังสือทดสอบ' }),
      );
    });
  });

  // ─── getPredictions() ────────────────────────────────────────────────────

  describe('getPredictions()', () => {
    it('passes caseId as BigInt to predictive service', () => {
      mockPredictive.getPredictions.mockResolvedValue([]);
      controller.getPredictions(42);
      expect(mockPredictive.getPredictions).toHaveBeenCalledWith(BigInt(42));
    });
  });

  // ─── submitPredictionFeedback() ──────────────────────────────────────────

  describe('submitPredictionFeedback()', () => {
    it('passes predictionId as BigInt and accepted flag', () => {
      mockPredictive.submitFeedback.mockResolvedValue({ ok: true });
      controller.submitPredictionFeedback(1, 99, { accepted: true });
      expect(mockPredictive.submitFeedback).toHaveBeenCalledWith(BigInt(99), true);
    });
  });

  // ─── findOne() ───────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('passes id, organizationId, and roleCode to svc.findById', async () => {
      const caseResult = { id: 1, title: 'หนังสือทดสอบ' };
      mockCasesService.findById.mockResolvedValue(caseResult);
      const user = { id: '3', organizationId: '10', roleCode: 'CLERK' };

      const result = await controller.findOne(1, user);

      expect(mockCasesService.findById).toHaveBeenCalledWith(1, 10, 'CLERK');
      expect(result).toEqual(caseResult);
    });

    it('ADMIN bypasses org check (roleCode forwarded so service can allow it)', async () => {
      mockCasesService.findById.mockResolvedValue({ id: 99 });
      const admin = { id: '1', organizationId: '1', roleCode: 'ADMIN' };

      await controller.findOne(99, admin);

      expect(mockCasesService.findById).toHaveBeenCalledWith(99, 1, 'ADMIN');
    });
  });

  // ─── getOptions() ────────────────────────────────────────────────────────

  describe('getOptions()', () => {
    it('passes id, organizationId, and roleCode to svc.getOptions', async () => {
      const opts = { caseId: 1, options: [] };
      mockCasesService.getOptions.mockResolvedValue(opts);
      const user = { id: '3', organizationId: '10', roleCode: 'DIRECTOR' };

      const result = await controller.getOptions(1, user);

      expect(mockCasesService.getOptions).toHaveBeenCalledWith(1, 10, 'DIRECTOR');
      expect(result).toEqual(opts);
    });
  });
});
