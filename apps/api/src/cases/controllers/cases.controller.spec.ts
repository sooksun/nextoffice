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
};

const mockWorkflow = {
  register: jest.fn(),
  assign: jest.fn(),
  updateStatus: jest.fn(),
  getAssignments: jest.fn(),
  updateAssignmentStatus: jest.fn(),
  getActivities: jest.fn(),
};

const mockSmartRouting = { applyRoutingToCase: jest.fn() };
const mockPredictive = { getPredictions: jest.fn(), submitFeedback: jest.fn() };
const mockDraftGen = { generateDraft: jest.fn() };
const mockPolicyAlignment = { getAlignmentForCase: jest.fn() };

// ─── Test Suite ──────────────────────────────────────────────────────────────

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

  // ─── listCases ───────────────────────────────────────────────────────────

  describe('listCases()', () => {
    it('passes numeric query params correctly', () => {
      mockCasesService.listCases.mockReturnValue([]);
      controller.listCases('1', 'proposed', undefined, undefined, undefined, undefined, undefined, undefined, '20', '0');
      expect(mockCasesService.listCases).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 1, status: 'proposed', take: 20, skip: 0 }),
      );
    });

    it('passes undefined when query params are omitted', () => {
      mockCasesService.listCases.mockReturnValue([]);
      controller.listCases();
      expect(mockCasesService.listCases).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: undefined, take: undefined }),
      );
    });
  });

  // ─── getMyTasks ──────────────────────────────────────────────────────────

  describe('getMyTasks()', () => {
    it('calls service with user id as number', () => {
      mockCasesService.getMyTasks.mockReturnValue([]);
      controller.getMyTasks({ id: '3' });
      expect(mockCasesService.getMyTasks).toHaveBeenCalledWith(3);
    });
  });

  // ─── register ────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('delegates to workflow.register with caseId and userId', async () => {
      mockWorkflow.register.mockResolvedValue({ id: 1, status: 'registered', registrationNo: '001/2568' });
      const result = await controller.register(1, { id: '5' });
      expect(mockWorkflow.register).toHaveBeenCalledWith(1, 5);
      expect(result.registrationNo).toBe('001/2568');
    });
  });

  // ─── assign ──────────────────────────────────────────────────────────────

  describe('assign()', () => {
    it('passes all body fields to workflow.assign', async () => {
      mockWorkflow.assign.mockResolvedValue({ ok: true });
      const user = { id: '1' };
      const body = {
        assignments: [{ userId: 3, role: 'responsible' }],
        directorNote: 'เร่งด่วน',
        selectedOptionId: 2,
      };

      await controller.assign(10, user, body);

      expect(mockWorkflow.assign).toHaveBeenCalledWith(10, 1, body.assignments, 'เร่งด่วน', 2);
    });
  });

  // ─── updateStatus ────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('delegates status update to workflow', async () => {
      mockWorkflow.updateStatus.mockResolvedValue({ status: 'assigned' });
      await controller.updateStatus(1, { id: '2' }, { status: 'assigned' });
      expect(mockWorkflow.updateStatus).toHaveBeenCalledWith(1, 'assigned', 2);
    });
  });

  // ─── generateDraft ───────────────────────────────────────────────────────

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

  // ─── getOverdue ──────────────────────────────────────────────────────────

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
});
