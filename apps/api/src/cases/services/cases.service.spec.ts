import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CasesService } from './cases.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PolicyRagService } from '../../rag/services/policy-rag.service';
import { HorizonRagService } from '../../rag/services/horizon-rag.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';
import { NotificationService } from '../../notifications/notification.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  documentIntake: { findUnique: jest.fn() },
  inboundCase: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  document: { create: jest.fn() },
  caseAssignment: { findMany: jest.fn() },
  documentAiResult: { findFirst: jest.fn() },
};

const mockPolicyRag = { search: jest.fn().mockResolvedValue([]) };
const mockHorizonRag = { search: jest.fn().mockResolvedValue([]) };
const mockGemini = { generateContent: jest.fn() };
const mockNotifications = { notifyNewDocumentArrived: jest.fn().mockResolvedValue(undefined) };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeIntake(overrides: Partial<any> = {}) {
  return {
    id: BigInt(42),
    organizationId: BigInt(1),
    fileName: 'doc.pdf',
    aiResult: {
      subjectText: 'หนังสือขอรับการสนับสนุน',
      summaryText: 'สรุปเนื้อหา',
      deadlineDate: null,
      nextActionJson: null,
    },
    ...overrides,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('CasesService', () => {
  let service: CasesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PolicyRagService, useValue: mockPolicyRag },
        { provide: HorizonRagService, useValue: mockHorizonRag },
        { provide: GeminiApiService, useValue: mockGemini },
        { provide: NotificationService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<CasesService>(CasesService);
  });

  // ─── createFromIntake() ──────────────────────────────────────────────────

  describe('createFromIntake()', () => {
    it('creates a new case from a classified intake', async () => {
      const intake = makeIntake();
      mockPrisma.documentIntake.findUnique.mockResolvedValue(intake);
      mockPrisma.inboundCase.findFirst.mockResolvedValue(null);
      mockPrisma.inboundCase.create.mockResolvedValue({
        id: BigInt(10),
        organizationId: BigInt(1),
        title: 'หนังสือขอรับการสนับสนุน',
        status: 'new',
      });

      const result = await service.createFromIntake(42);

      expect(result).toEqual({ caseId: 10, status: 'created' });
      expect(mockPrisma.inboundCase.create).toHaveBeenCalledTimes(1);

      const createData = mockPrisma.inboundCase.create.mock.calls[0][0].data;
      expect(createData.title).toBe('หนังสือขอรับการสนับสนุน');
      expect(createData.description).toContain('intake:42');
    });

    it('returns existing case without creating a duplicate', async () => {
      mockPrisma.documentIntake.findUnique.mockResolvedValue(makeIntake());
      mockPrisma.inboundCase.findFirst.mockResolvedValue({
        id: BigInt(7),
        organizationId: BigInt(1),
        status: 'registered',
      });

      const result = await service.createFromIntake(42);

      expect(result).toEqual({ caseId: 7, status: 'existing' });
      expect(mockPrisma.inboundCase.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when intake does not exist', async () => {
      mockPrisma.documentIntake.findUnique.mockResolvedValue(null);

      await expect(service.createFromIntake(999)).rejects.toThrow(NotFoundException);
    });

    it('uses fileName as title when aiResult has no subjectText', async () => {
      const intake = makeIntake({ fileName: 'หนังสือ.pdf', aiResult: null });
      mockPrisma.documentIntake.findUnique.mockResolvedValue(intake);
      mockPrisma.inboundCase.findFirst.mockResolvedValue(null);
      mockPrisma.inboundCase.create.mockResolvedValue({
        id: BigInt(11),
        organizationId: BigInt(1),
        title: 'หนังสือ.pdf',
        status: 'new',
      });

      await service.createFromIntake(42);
      const createData = mockPrisma.inboundCase.create.mock.calls[0][0].data;
      expect(createData.title).toBe('หนังสือ.pdf');
    });

    it('falls back to "เอกสารไม่ระบุชื่อ" when intake has neither fileName nor aiResult', async () => {
      const intake = { id: BigInt(42), organizationId: BigInt(1), aiResult: null };
      mockPrisma.documentIntake.findUnique.mockResolvedValue(intake);
      mockPrisma.inboundCase.findFirst.mockResolvedValue(null);
      mockPrisma.inboundCase.create.mockResolvedValue({
        id: BigInt(12),
        title: 'เอกสารไม่ระบุชื่อ',
        status: 'new',
        organizationId: BigInt(1),
      });

      await service.createFromIntake(42);
      const createData = mockPrisma.inboundCase.create.mock.calls[0][0].data;
      expect(createData.title).toBe('เอกสารไม่ระบุชื่อ');
    });
  });

  // ─── createManual() ──────────────────────────────────────────────────────

  describe('createManual()', () => {
    it('creates a Document record and InboundCase', async () => {
      mockPrisma.document.create.mockResolvedValue({ id: BigInt(100) });
      mockPrisma.inboundCase.create.mockResolvedValue({
        id: BigInt(20),
        organizationId: BigInt(1),
        title: 'หนังสือทดสอบ',
        status: 'new',
      });

      const result = await service.createManual({
        organizationId: 1,
        createdByUserId: 5,
        title: 'หนังสือทดสอบ',
        senderOrg: 'สพม.1',
      });

      expect(result).toEqual({ caseId: 20, status: 'created' });
      expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);

      const caseData = mockPrisma.inboundCase.create.mock.calls[0][0].data;
      expect(caseData.urgencyLevel).toBe('normal');
      expect(caseData.status).toBe('new');
    });

    it('includes intakeId in description when provided', async () => {
      mockPrisma.document.create.mockResolvedValue({ id: BigInt(100) });
      mockPrisma.inboundCase.create.mockResolvedValue({
        id: BigInt(21),
        status: 'new',
        organizationId: BigInt(1),
        title: 'T',
      });

      await service.createManual({
        organizationId: 1,
        createdByUserId: 5,
        title: 'T',
        intakeId: 88,
      });

      const caseData = mockPrisma.inboundCase.create.mock.calls[0][0].data;
      expect(caseData.description).toContain('intake:88');
    });

    it('includes recipientNote in description when provided', async () => {
      mockPrisma.document.create.mockResolvedValue({ id: BigInt(100) });
      mockPrisma.inboundCase.create.mockResolvedValue({
        id: BigInt(22), status: 'new', organizationId: BigInt(1), title: 'T',
      });

      await service.createManual({
        organizationId: 1,
        createdByUserId: 5,
        title: 'T',
        recipientNote: 'ผู้อำนวยการ',
      });

      const caseData = mockPrisma.inboundCase.create.mock.calls[0][0].data;
      expect(caseData.description).toContain('ถึง: ผู้อำนวยการ');
    });
  });

  // ─── findById() ──────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('throws NotFoundException when case does not exist', async () => {
      mockPrisma.inboundCase.findUnique.mockResolvedValue(null);

      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });
});
