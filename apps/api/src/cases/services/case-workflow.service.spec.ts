import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaseWorkflowService } from './case-workflow.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleCalendarService } from '../../calendar/services/google-calendar.service';
import { NotificationService } from '../../notifications/notification.service';
import { QueueDispatcherService } from '../../queue/services/queue-dispatcher.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCase(overrides: Partial<any> = {}) {
  return {
    id: BigInt(1),
    organizationId: BigInt(10),
    title: 'Test Document',
    description: 'intake:42',
    status: 'proposed',
    registrationNo: null,
    registeredAt: null,
    registeredByUserId: null,
    assignedToUserId: null,
    selectedOptionId: null,
    sourceDocumentId: null,
    dueDate: null,
    directorStampStatus: null,
    directorStampZoneJson: null,
    directorNote: null,
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<any> = {}) {
  return {
    id: BigInt(100),
    inboundCaseId: BigInt(1),
    assignedToUserId: BigInt(3),
    assignedByUserId: BigInt(10),
    role: 'responsible',
    status: 'pending',
    dueDate: null,
    note: null,
    completedAt: null,
    googleCalendarEventId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Partial<any> = {}) {
  return {
    id: BigInt(3),
    organizationId: BigInt(10),
    fullName: 'ครูทดสอบ',
    email: 'teacher@school.th',
    googleEmail: null,
    positionTitle: 'ครู',
    signaturePath: null,
    roleCode: 'TEACHER',
    department: 'วิชาการ',
    ...overrides,
  };
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  inboundCase: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  organization: { findUnique: jest.fn() },
  academicYear: { findFirst: jest.fn() },
  registrationCounter: { upsert: jest.fn() },
  caseAssignment: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  caseEndorsement: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  caseActivity: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockCalendar = {
  createAssignmentReminderEvent: jest.fn().mockResolvedValue('event-123'),
  createDeadlineEvent: jest.fn().mockResolvedValue('deadline-event-id'),
};
const mockConfig = { get: jest.fn((_key: string, def?: any) => def ?? 'https://nextoffice.cnppai.com') };
const mockNotifications = {
  notifyCaseRegistered: jest.fn().mockResolvedValue(undefined),
  notifyStatusChanged: jest.fn().mockResolvedValue(undefined),
  notifyDirectorPendingSigning: jest.fn().mockResolvedValue(undefined),
  notifyAssigneesDirectorSigned: jest.fn().mockResolvedValue(undefined),
};
const mockDispatcher = {
  dispatchVaultNoteGenerate: jest.fn().mockResolvedValue(undefined),
};

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('CaseWorkflowService', () => {
  let service: CaseWorkflowService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // $transaction executes the callback using the same mock as the tx client
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseWorkflowService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GoogleCalendarService, useValue: mockCalendar },
        { provide: ConfigService, useValue: mockConfig },
        { provide: NotificationService, useValue: mockNotifications },
        { provide: QueueDispatcherService, useValue: mockDispatcher },
      ],
    }).compile();

    service = module.get<CaseWorkflowService>(CaseWorkflowService);
  });

  // ─── updateStatus — state machine ─────────────────────────────────────────

  describe('updateStatus()', () => {
    const validTransitions = [
      ['new', 'registered'],
      ['analyzing', 'registered'],
      ['proposed', 'registered'],
      ['registered', 'assigned'],
      ['assigned', 'in_progress'],
      ['in_progress', 'completed'],
      ['completed', 'archived'],
    ];

    test.each(validTransitions)('allows %s → %s', async (from, to) => {
      const c = makeCase({ status: from });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.inboundCase.update.mockResolvedValue({ ...c, status: to });
      mockPrisma.caseActivity.create.mockResolvedValue({});

      await expect(service.updateStatus(1, to, 99, 10)).resolves.toBeDefined();
    });

    const invalidTransitions = [
      ['new', 'completed'],
      ['new', 'in_progress'],
      ['proposed', 'assigned'],
      ['registered', 'in_progress'],
      ['completed', 'new'],
      ['archived', 'registered'],
    ];

    test.each(invalidTransitions)('rejects invalid %s → %s', async (from, to) => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(makeCase({ status: from }));

      await expect(service.updateStatus(1, to, 99, 10)).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when caller org differs from case org', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(
        makeCase({ status: 'registered', organizationId: BigInt(99) }),
      );

      await expect(service.updateStatus(1, 'assigned', 1, 1)).rejects.toThrow(ForbiddenException);
    });

    it('skips org check when callerOrgId is undefined', async () => {
      const c = makeCase({ status: 'registered' });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.inboundCase.update.mockResolvedValue({ ...c, status: 'assigned' });
      mockPrisma.caseActivity.create.mockResolvedValue({});

      await expect(service.updateStatus(1, 'assigned', 1, undefined)).resolves.toBeDefined();
    });

    it('throws NotFoundException when case does not exist', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus(999, 'registered', 1, 1)).rejects.toThrow(NotFoundException);
    });

    it('fires status-change notification as fire-and-forget', async () => {
      const c = makeCase({ status: 'assigned' });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.inboundCase.update.mockResolvedValue({ ...c, status: 'in_progress' });
      mockPrisma.caseActivity.create.mockResolvedValue({});

      await service.updateStatus(1, 'in_progress', 5, 10);

      expect(mockNotifications.notifyStatusChanged).toHaveBeenCalledWith(
        1, 'assigned', 'in_progress', 5,
      );
    });

    it('dispatches vault note when case moves to completed', async () => {
      const c = makeCase({ status: 'in_progress' });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.inboundCase.update.mockResolvedValue({ ...c, status: 'completed' });
      mockPrisma.caseActivity.create.mockResolvedValue({});

      await service.updateStatus(1, 'completed', 5, 10);

      expect(mockDispatcher.dispatchVaultNoteGenerate).toHaveBeenCalledWith(
        BigInt(1), 'case_completed',
      );
    });
  });

  // ─── register() ───────────────────────────────────────────────────────────

  describe('register()', () => {
    beforeEach(() => {
      mockPrisma.organization.findUnique.mockResolvedValue({ activeAcademicYear: { year: 2568 } });
      mockPrisma.registrationCounter.upsert.mockResolvedValue({ lastSeq: 1 });
      mockPrisma.caseActivity.create.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    });

    it('registers a proposed case and returns a formatted registration number', async () => {
      const c = makeCase({ status: 'proposed' });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.inboundCase.update.mockResolvedValue({
        ...c, status: 'registered', registrationNo: '001/2568', registeredByUserId: BigInt(5),
      });

      const result = await service.register(1, 5);

      expect(result.status).toBe('registered');
      expect(result.registrationNo).toBe('001/2568');
      expect(typeof result.id).toBe('number');
    });

    it('generates zero-padded 3-digit sequence: seq=7 → "007/2568"', async () => {
      mockPrisma.registrationCounter.upsert.mockResolvedValue({ lastSeq: 7 });
      const c = makeCase({ status: 'new' });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.inboundCase.update.mockResolvedValue({
        ...c, status: 'registered', registrationNo: '007/2568', registeredByUserId: BigInt(1),
      });

      const result = await service.register(1, 1);

      expect(result.registrationNo).toBe('007/2568');
    });

    it('falls back to global academic year when org has none configured', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ activeAcademicYear: null });
      mockPrisma.academicYear.findFirst.mockResolvedValue({ year: 2567 });
      mockPrisma.registrationCounter.upsert.mockResolvedValue({ lastSeq: 3 });
      const c = makeCase({ status: 'proposed' });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.inboundCase.update.mockResolvedValue({
        ...c, status: 'registered', registrationNo: '003/2567', registeredByUserId: BigInt(1),
      });

      const result = await service.register(1, 1);

      expect(result.registrationNo).toBe('003/2567');
    });

    it('throws BadRequestException when caller user is from a different org', async () => {
      const c = makeCase({ status: 'proposed', organizationId: BigInt(10) });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.user.findUnique.mockResolvedValue(makeUser({ organizationId: BigInt(99) }));

      await expect(service.register(1, 5)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when case does not exist', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(null);

      await expect(service.register(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when registering an already-registered case', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(makeCase({ status: 'registered' }));

      await expect(service.register(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('fires vault dispatch and notifies on successful registration', async () => {
      const c = makeCase({ status: 'proposed' });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.inboundCase.update.mockResolvedValue({
        ...c, status: 'registered', registrationNo: '001/2568', registeredByUserId: BigInt(5),
      });

      await service.register(1, 5);

      expect(mockNotifications.notifyCaseRegistered).toHaveBeenCalledWith(1);
      expect(mockDispatcher.dispatchVaultNoteGenerate).toHaveBeenCalledWith(BigInt(1), 'case_registered');
    });
  });

  // ─── assign() ─────────────────────────────────────────────────────────────

  describe('assign()', () => {
    function setupAssignBase(caseStatus = 'registered', caseOverrides: Partial<any> = {}) {
      const c = makeCase({ status: caseStatus, organizationId: BigInt(10), ...caseOverrides });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.user.findUnique.mockResolvedValue(makeUser({ organizationId: BigInt(10) }));
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.inboundCase.update.mockResolvedValue({ ...c, status: 'assigned', assignedToUserId: BigInt(3) });
      mockPrisma.caseEndorsement.create.mockResolvedValue({});
      mockPrisma.caseActivity.create.mockResolvedValue({});
      return c;
    }

    it('throws BadRequestException when case is not in a valid assignment status', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(makeCase({ status: 'proposed' }));

      await expect(service.assign(1, 10, [{ userId: 2 }])).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when caller is from a different org than the case', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(makeCase({ status: 'registered', organizationId: BigInt(99) }));
      mockPrisma.user.findUnique.mockResolvedValue(makeUser({ organizationId: BigInt(1) }));

      await expect(service.assign(1, 10, [{ userId: 2 }])).rejects.toThrow(BadRequestException);
    });

    it('creates a new assignment via transaction and returns it in the result', async () => {
      setupAssignBase();
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.caseAssignment.create.mockResolvedValue(makeAssignment());

      const result = await service.assign(1, 10, [{ userId: 3 }]);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.caseAssignment.create).toHaveBeenCalledTimes(1);
      expect(result.assignments).toHaveLength(1);
      expect(result.assignments[0].assignedToUserId).toBe(3);
    });

    it('skips duplicate: returns existing assignment without calling create', async () => {
      setupAssignBase();
      const existing = makeAssignment({ id: BigInt(50) });
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(existing);

      const result = await service.assign(1, 10, [{ userId: 3 }]);

      expect(mockPrisma.caseAssignment.create).not.toHaveBeenCalled();
      expect(result.assignments[0].id).toBe(50);
    });

    it('does not create a calendar reminder for skipped (duplicate) assignments', async () => {
      setupAssignBase();
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(makeAssignment());

      await service.assign(1, 10, [{ userId: 3 }]);

      expect(mockCalendar.createAssignmentReminderEvent).not.toHaveBeenCalled();
    });

    it('creates calendar reminder ONLY for newly created assignments, not skipped ones', async () => {
      const dueDate = new Date('2027-01-15');
      setupAssignBase('registered', { dueDate });
      // User 3 → existing (skip), User 4 → new
      mockPrisma.caseAssignment.findFirst
        .mockResolvedValueOnce(makeAssignment({ id: BigInt(50) }))
        .mockResolvedValueOnce(null);
      mockPrisma.caseAssignment.create.mockResolvedValue(makeAssignment({ id: BigInt(101), assignedToUserId: BigInt(4) }));
      mockPrisma.caseAssignment.update.mockResolvedValue({});

      await service.assign(1, 10, [{ userId: 3 }, { userId: 4 }]);

      expect(mockCalendar.createAssignmentReminderEvent).toHaveBeenCalledTimes(1);
    });

    it('does not create a calendar reminder when case has no dueDate', async () => {
      setupAssignBase('registered', { dueDate: null });
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.caseAssignment.create.mockResolvedValue(makeAssignment());

      await service.assign(1, 10, [{ userId: 3 }]);

      expect(mockCalendar.createAssignmentReminderEvent).not.toHaveBeenCalled();
    });

    it('accepts re-assignment when case is already in "assigned" status', async () => {
      setupAssignBase('assigned');
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.caseAssignment.create.mockResolvedValue(makeAssignment());

      await expect(service.assign(1, 10, [{ userId: 3 }])).resolves.toBeDefined();
    });

    it('saves calendar event ID to assignment after reminder creation', async () => {
      const dueDate = new Date('2027-03-01');
      setupAssignBase('registered', { dueDate });
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(null);
      const newAssignment = makeAssignment({ id: BigInt(100) });
      mockPrisma.caseAssignment.create.mockResolvedValue(newAssignment);
      mockPrisma.caseAssignment.update.mockResolvedValue({});

      await service.assign(1, 10, [{ userId: 3 }]);

      expect(mockPrisma.caseAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: newAssignment.id },
          data: { googleCalendarEventId: 'event-123' },
        }),
      );
    });

    it('serializes BigInt fields in returned assignments', async () => {
      setupAssignBase();
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.caseAssignment.create.mockResolvedValue(
        makeAssignment({ id: BigInt(100), assignedToUserId: BigInt(3) }),
      );

      const result = await service.assign(1, 10, [{ userId: 3 }]);

      expect(typeof result.assignments[0].id).toBe('number');
      expect(typeof result.assignments[0].assignedToUserId).toBe('number');
    });

    it('uses spread to update case without data:any — directorNote and selectedOptionId saved', async () => {
      setupAssignBase();
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.caseAssignment.create.mockResolvedValue(makeAssignment());

      await service.assign(1, 10, [{ userId: 3 }], 'เร่งด่วนมาก', 7);

      const updateCall = mockPrisma.inboundCase.update.mock.calls[0][0];
      expect(updateCall.data.directorNote).toBe('เร่งด่วนมาก');
      expect(updateCall.data.selectedOptionId).toEqual(BigInt(7));
    });

    it('does not set directorNote or selectedOptionId when not provided', async () => {
      setupAssignBase();
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.caseAssignment.create.mockResolvedValue(makeAssignment());

      await service.assign(1, 10, [{ userId: 3 }]);

      const updateCall = mockPrisma.inboundCase.update.mock.calls[0][0];
      expect(updateCall.data.directorNote).toBeUndefined();
      expect(updateCall.data.selectedOptionId).toBeUndefined();
    });
  });

  // ─── updateAssignmentStatus() ─────────────────────────────────────────────

  describe('updateAssignmentStatus()', () => {
    const baseAssignment = makeAssignment({ id: BigInt(100), inboundCaseId: BigInt(1) });

    beforeEach(() => {
      mockPrisma.caseAssignment.findUnique.mockResolvedValue(baseAssignment);
      mockPrisma.caseActivity.create.mockResolvedValue({});
    });

    it('updates status from pending to accepted', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(makeCase({ organizationId: BigInt(10) }));
      mockPrisma.caseAssignment.update.mockResolvedValue({ ...baseAssignment, status: 'accepted' });
      mockPrisma.caseAssignment.count.mockResolvedValue(1);

      const result = await service.updateAssignmentStatus(100, 'accepted', 3, 10);

      expect(result.status).toBe('accepted');
      const updateCall = mockPrisma.caseAssignment.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('accepted');
      expect(updateCall.data.completedAt).toBeUndefined();
    });

    it('sets completedAt when status becomes completed', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(makeCase({ organizationId: BigInt(10) }));
      mockPrisma.caseAssignment.update.mockResolvedValue({
        ...baseAssignment, status: 'completed', completedAt: new Date(),
      });
      mockPrisma.caseAssignment.count.mockResolvedValue(1);

      await service.updateAssignmentStatus(100, 'completed', 3, 10);

      const updateCall = mockPrisma.caseAssignment.update.mock.calls[0][0];
      expect(updateCall.data.completedAt).toBeInstanceOf(Date);
    });

    it('auto-completes the parent case when all responsible assignments finish', async () => {
      mockPrisma.inboundCase.findUnique
        .mockResolvedValueOnce(makeCase({ organizationId: BigInt(10) }))  // org check
        .mockResolvedValueOnce(makeCase({ status: 'assigned' }));          // auto-complete check
      mockPrisma.caseAssignment.update.mockResolvedValue({
        ...baseAssignment, status: 'completed', completedAt: new Date(),
      });
      mockPrisma.caseAssignment.count.mockResolvedValue(0);
      mockPrisma.inboundCase.update.mockResolvedValue({});

      await service.updateAssignmentStatus(100, 'completed', 3, 10);

      expect(mockPrisma.inboundCase.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'completed' } }),
      );
    });

    it('does not auto-complete when pending responsible assignments remain', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(makeCase({ organizationId: BigInt(10) }));
      mockPrisma.caseAssignment.update.mockResolvedValue({
        ...baseAssignment, status: 'completed', completedAt: new Date(),
      });
      mockPrisma.caseAssignment.count.mockResolvedValue(2);

      await service.updateAssignmentStatus(100, 'completed', 3, 10);

      expect(mockPrisma.inboundCase.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when caller is from a different org', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(makeCase({ organizationId: BigInt(99) }));

      await expect(
        service.updateAssignmentStatus(100, 'accepted', 3, 1),
      ).rejects.toThrow(ForbiddenException);
    });

    it('skips org check entirely when callerOrgId is undefined', async () => {
      mockPrisma.caseAssignment.update.mockResolvedValue({ ...baseAssignment, status: 'accepted' });
      mockPrisma.caseAssignment.count.mockResolvedValue(1);

      await expect(service.updateAssignmentStatus(100, 'accepted', 3, undefined)).resolves.toBeDefined();
      expect(mockPrisma.inboundCase.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when assignment does not exist', async () => {
      mockPrisma.caseAssignment.findUnique.mockResolvedValue(null);

      await expect(service.updateAssignmentStatus(999, 'accepted', 3, 10)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addProgressReport() ──────────────────────────────────────────────────

  describe('addProgressReport()', () => {
    it('logs activity and advances pending assignment to in_progress', async () => {
      const assignment = makeAssignment({ status: 'pending' });
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(assignment);
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.caseAssignment.update.mockResolvedValue({ ...assignment, status: 'in_progress' });
      mockPrisma.caseActivity.create.mockResolvedValue({});

      const result = await service.addProgressReport(1, 3, 'ดำเนินการแล้ว');

      expect(result.success).toBe(true);
      expect(mockPrisma.caseAssignment.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.caseActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'progress_report' }),
        }),
      );
    });

    it('logs activity and advances accepted assignment to in_progress', async () => {
      const assignment = makeAssignment({ status: 'accepted' });
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(assignment);
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.caseAssignment.update.mockResolvedValue({ ...assignment, status: 'in_progress' });
      mockPrisma.caseActivity.create.mockResolvedValue({});

      const result = await service.addProgressReport(1, 3, 'รายงานความคืบหน้า');

      expect(result.assignmentStatus).toBe('in_progress');
    });

    it('does not update assignment status when already in_progress', async () => {
      const assignment = makeAssignment({ status: 'in_progress' });
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(assignment);
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.caseActivity.create.mockResolvedValue({});

      await service.addProgressReport(1, 3, 'ดำเนินการต่อเนื่อง');

      expect(mockPrisma.caseAssignment.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when reportText is empty string', async () => {
      await expect(service.addProgressReport(1, 3, '')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when reportText is whitespace only', async () => {
      await expect(service.addProgressReport(1, 3, '   ')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when user has no assignment on this case', async () => {
      mockPrisma.caseAssignment.findFirst.mockResolvedValue(null);

      await expect(service.addProgressReport(1, 3, 'รายงาน')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getActivities() ──────────────────────────────────────────────────────

  describe('getActivities()', () => {
    it('returns serialized activity list with nested user info', async () => {
      mockPrisma.caseActivity.findMany.mockResolvedValue([
        {
          id: BigInt(1),
          action: 'register',
          detail: JSON.stringify({ registrationNo: '001/2568' }),
          user: { id: BigInt(5), fullName: 'ธุรการ', roleCode: 'CLERK' },
          createdAt: new Date('2026-01-01'),
        },
      ]);

      const result = await service.getActivities(1);

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('register');
      expect(typeof result[0].id).toBe('number');
      expect(result[0].detail).toEqual({ registrationNo: '001/2568' });
      expect(result[0].user.id).toBe(5);
    });

    it('handles activities with null detail and null user gracefully', async () => {
      mockPrisma.caseActivity.findMany.mockResolvedValue([
        { id: BigInt(2), action: 'auto_complete', detail: null, user: null, createdAt: new Date() },
      ]);

      const result = await service.getActivities(1);

      expect(result[0].detail).toBeNull();
      expect(result[0].user).toBeNull();
    });

    it('returns empty array when no activities exist', async () => {
      mockPrisma.caseActivity.findMany.mockResolvedValue([]);

      const result = await service.getActivities(1);

      expect(result).toEqual([]);
    });
  });

  // ─── getAssignments() ─────────────────────────────────────────────────────

  describe('getAssignments()', () => {
    it('returns all assignments with serialized BigInt fields', async () => {
      mockPrisma.caseAssignment.findMany.mockResolvedValue([
        {
          id: BigInt(100),
          role: 'responsible',
          status: 'pending',
          dueDate: null,
          note: null,
          completedAt: null,
          createdAt: new Date(),
          assignedTo: { id: BigInt(3), fullName: 'ครูสมชาย', roleCode: 'TEACHER', department: 'วิชาการ' },
          assignedBy: { id: BigInt(10), fullName: 'ธุรการ', roleCode: 'CLERK' },
        },
      ]);

      const result = await service.getAssignments(1);

      expect(result).toHaveLength(1);
      expect(typeof result[0].id).toBe('number');
      expect(typeof result[0].assignedTo.id).toBe('number');
      expect(typeof result[0].assignedBy.id).toBe('number');
      expect(result[0].assignedTo.fullName).toBe('ครูสมชาย');
    });

    it('returns empty array when no assignments exist', async () => {
      mockPrisma.caseAssignment.findMany.mockResolvedValue([]);

      const result = await service.getAssignments(1);

      expect(result).toEqual([]);
    });
  });

  // ─── getEndorsements() ────────────────────────────────────────────────────

  describe('getEndorsements()', () => {
    it('returns endorsements ordered by stepOrder with serialized ids', async () => {
      mockPrisma.caseEndorsement.findMany.mockResolvedValue([
        {
          id: BigInt(1),
          inboundCaseId: BigInt(1),
          authorUserId: BigInt(5),
          roleCode: 'CLERK',
          stepOrder: 1,
          noteText: 'เห็นควรดำเนินการ',
          assignToUserIds: JSON.stringify([3, 4]),
          routingPath: 'direct',
          createdAt: new Date(),
          updatedAt: new Date(),
          author: { id: BigInt(5), fullName: 'ธุรการ', roleCode: 'CLERK' },
        },
      ]);

      const result = await service.getEndorsements(1);

      expect(result).toHaveLength(1);
      expect(typeof result[0].id).toBe('number');
      expect(typeof result[0].author.id).toBe('number');
      expect(result[0].assignToUserIds).toEqual([3, 4]);
      expect(result[0].noteText).toBe('เห็นควรดำเนินการ');
    });

    it('handles null assignToUserIds', async () => {
      mockPrisma.caseEndorsement.findMany.mockResolvedValue([
        {
          id: BigInt(1),
          inboundCaseId: BigInt(1),
          authorUserId: BigInt(5),
          roleCode: 'DIRECTOR',
          stepOrder: 3,
          noteText: 'อนุมัติ',
          assignToUserIds: null,
          routingPath: 'direct',
          createdAt: new Date(),
          updatedAt: new Date(),
          author: { id: BigInt(5), fullName: 'ผอ.', roleCode: 'DIRECTOR' },
        },
      ]);

      const result = await service.getEndorsements(1);

      expect(result[0].assignToUserIds).toEqual([]);
    });
  });

  // ─── BigInt serialization ─────────────────────────────────────────────────

  describe('BigInt serialization (via register)', () => {
    it('converts all BigInt fields to Number in the returned object', async () => {
      const raw = makeCase({
        status: 'proposed',
        registeredByUserId: BigInt(5),
        selectedOptionId: BigInt(9),
        sourceDocumentId: BigInt(3),
      });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(raw);
      mockPrisma.inboundCase.update.mockResolvedValue({
        ...raw, status: 'registered', registrationNo: '001/2568',
        registeredByUserId: BigInt(5), selectedOptionId: BigInt(9), sourceDocumentId: BigInt(3),
      });
      mockPrisma.organization.findUnique.mockResolvedValue({ activeAcademicYear: { year: 2568 } });
      mockPrisma.registrationCounter.upsert.mockResolvedValue({ lastSeq: 1 });
      mockPrisma.caseActivity.create.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.register(1, 5);

      expect(typeof result.id).toBe('number');
      expect(typeof result.organizationId).toBe('number');
      expect(typeof result.registeredByUserId).toBe('number');
      expect(typeof result.selectedOptionId).toBe('number');
      expect(typeof result.sourceDocumentId).toBe('number');
    });
  });
});
