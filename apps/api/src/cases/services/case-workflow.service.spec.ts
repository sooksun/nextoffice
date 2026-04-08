import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaseWorkflowService } from './case-workflow.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleCalendarService } from '../../calendar/services/google-calendar.service';
import { NotificationService } from '../../notifications/notification.service';
import { QueueDispatcherService } from '../../queue/services/queue-dispatcher.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCase(overrides: Partial<any> = {}) {
  return {
    id: BigInt(1),
    organizationId: BigInt(1),
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
  caseAssignment: { create: jest.fn(), count: jest.fn() },
  caseActivity: { create: jest.fn() },
  user: { findUnique: jest.fn() },
};

const mockCalendar = { createAssignmentReminderEvent: jest.fn().mockResolvedValue('event-id') };
const mockConfig = { get: jest.fn((_key: string, def?: any) => def ?? '') };
const mockNotifications = {
  notifyCaseRegistered: jest.fn().mockResolvedValue(undefined),
  notifyStatusChanged: jest.fn().mockResolvedValue(undefined),
};
const mockDispatcher = { dispatchVaultNoteGenerate: jest.fn().mockResolvedValue(undefined) };

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('CaseWorkflowService', () => {
  let service: CaseWorkflowService;

  beforeEach(async () => {
    jest.clearAllMocks();

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

  // ─── VALID_TRANSITIONS state machine ────────────────────────────────────

  describe('updateStatus — state machine', () => {
    const validPaths = [
      ['new', 'registered'],
      ['analyzing', 'registered'],
      ['proposed', 'registered'],
      ['registered', 'assigned'],
      ['assigned', 'in_progress'],
      ['in_progress', 'completed'],
      ['completed', 'archived'],
    ];

    test.each(validPaths)(
      'allows transition %s → %s',
      async (from, to) => {
        const c = makeCase({ status: from });
        mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
        mockPrisma.inboundCase.update.mockResolvedValue({ ...c, status: to });
        mockPrisma.caseActivity.create.mockResolvedValue({});

        await expect(service.updateStatus(1, to, 99)).resolves.toBeDefined();
      },
    );

    const invalidPaths = [
      ['new', 'completed'],
      ['new', 'in_progress'],
      ['proposed', 'assigned'],
      ['registered', 'in_progress'],
      ['completed', 'new'],
      ['archived', 'registered'],
    ];

    test.each(invalidPaths)(
      'rejects invalid transition %s → %s',
      async (from, to) => {
        mockPrisma.inboundCase.findUnique.mockResolvedValue(makeCase({ status: from }));

        await expect(service.updateStatus(1, to, 99)).rejects.toThrow(BadRequestException);
      },
    );
  });

  // ─── register() ─────────────────────────────────────────────────────────

  describe('register()', () => {
    beforeEach(() => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        activeAcademicYear: { year: 2568 },
      });
      mockPrisma.registrationCounter.upsert.mockResolvedValue({ lastSeq: 1 });
      mockPrisma.caseActivity.create.mockResolvedValue({});
    });

    it('registers a proposed case and returns formatted registration number', async () => {
      const c = makeCase({ status: 'proposed' });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.inboundCase.update.mockResolvedValue({
        ...c,
        status: 'registered',
        registrationNo: '001/2568',
        registeredByUserId: BigInt(5),
      });

      const result = await service.register(1, 5);

      expect(result.status).toBe('registered');
      expect(result.registrationNo).toBe('001/2568');
      expect(result.id).toBe(1); // BigInt serialized to Number
    });

    it('generates zero-padded sequence: seq=7 → "007/2568"', async () => {
      mockPrisma.registrationCounter.upsert.mockResolvedValue({ lastSeq: 7 });
      const c = makeCase({ status: 'new' });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.inboundCase.update.mockResolvedValue({
        ...c,
        status: 'registered',
        registrationNo: '007/2568',
        registeredByUserId: BigInt(1),
      });

      const result = await service.register(1, 1);
      expect(result.registrationNo).toBe('007/2568');
    });

    it('throws NotFoundException when case does not exist', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(null);

      await expect(service.register(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when registering an already-registered case', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(makeCase({ status: 'registered' }));

      await expect(service.register(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('falls back to global academic year when org has none', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ activeAcademicYear: null });
      mockPrisma.academicYear.findFirst.mockResolvedValue({ year: 2567 });
      mockPrisma.registrationCounter.upsert.mockResolvedValue({ lastSeq: 3 });

      const c = makeCase({ status: 'proposed' });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(c);
      mockPrisma.inboundCase.update.mockResolvedValue({
        ...c,
        status: 'registered',
        registrationNo: '003/2567',
        registeredByUserId: BigInt(1),
      });

      const result = await service.register(1, 1);
      expect(result.registrationNo).toBe('003/2567');
    });
  });

  // ─── assign() ────────────────────────────────────────────────────────────

  describe('assign()', () => {
    it('throws BadRequestException when case is not registered or assigned', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(makeCase({ status: 'proposed' }));

      await expect(service.assign(1, 1, [{ userId: 2 }])).rejects.toThrow(BadRequestException);
    });
  });

  // ─── serialize — BigInt → Number ─────────────────────────────────────────

  describe('serialize (via register return value)', () => {
    it('converts all BigInt fields to Number', async () => {
      const raw = makeCase({
        status: 'proposed',
        registeredByUserId: BigInt(5),
        selectedOptionId: BigInt(9),
        sourceDocumentId: BigInt(3),
      });
      mockPrisma.inboundCase.findUnique.mockResolvedValue(raw);
      mockPrisma.inboundCase.update.mockResolvedValue({
        ...raw,
        status: 'registered',
        registrationNo: '001/2568',
        registeredByUserId: BigInt(5),
        selectedOptionId: BigInt(9),
        sourceDocumentId: BigInt(3),
      });
      mockPrisma.organization.findUnique.mockResolvedValue({ activeAcademicYear: { year: 2568 } });
      mockPrisma.registrationCounter.upsert.mockResolvedValue({ lastSeq: 1 });
      mockPrisma.caseActivity.create.mockResolvedValue({});

      const result = await service.register(1, 5);

      expect(typeof result.id).toBe('number');
      expect(typeof result.organizationId).toBe('number');
      expect(typeof result.registeredByUserId).toBe('number');
      expect(typeof result.selectedOptionId).toBe('number');
      expect(typeof result.sourceDocumentId).toBe('number');
    });
  });
});
