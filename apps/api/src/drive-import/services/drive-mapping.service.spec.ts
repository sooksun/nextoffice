import { DriveMappingService } from './drive-mapping.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DriveMappingService', () => {
  const academicYear = { id: 10n, year: 2569 };
  const currentYear = { id: 9n, year: 2568 };
  const workGroup = { id: 20n, code: 'general' };

  function createService() {
    const prisma = {
      academicYear: {
        findUnique: jest.fn().mockResolvedValue(academicYear),
        findFirst: jest.fn().mockResolvedValue(currentYear),
      },
      workGroup: {
        findFirst: jest.fn().mockResolvedValue(workGroup),
      },
    };

    return {
      prisma,
      service: new DriveMappingService(prisma as unknown as PrismaService),
    };
  }

  it('maps Buddhist year, Thai month abbreviation, day, and Thai work group from Drive path', async () => {
    const { prisma, service } = createService();
    const result = await service.mapFile(1n, {
      id: 'drive-file-1',
      name: 'letter.pdf',
      mimeType: 'application/pdf',
      modifiedTime: '2026-01-02T00:00:00.000Z',
      path: [
        'root',
        '2569',
        '\u0e21.\u0e04.',
        '15',
        '\u0e2a\u0e32\u0e23\u0e1a\u0e23\u0e23\u0e13',
        'letter.pdf',
      ].join('/'),
    });

    expect(prisma.academicYear.findUnique).toHaveBeenCalledWith({ where: { year: 2569 } });
    expect(prisma.workGroup.findFirst).toHaveBeenCalledWith({
      where: {
        code: 'general',
        OR: [{ organizationId: 1n }, { organizationId: null }],
      },
      orderBy: { organizationId: 'desc' },
    });
    expect(result).toMatchObject({
      academicYearId: 10n,
      academicYearLabel: '2569',
      month: '01',
      day: '15',
      workGroupId: 20n,
      workGroupCode: 'general',
    });
    expect(result.reason).toContain('group:path:general');
  });

  it('converts Common Era folder years to Buddhist Era years', async () => {
    const { prisma, service } = createService();
    await service.mapFile(1n, {
      id: 'drive-file-2',
      name: 'letter.pdf',
      mimeType: 'application/pdf',
      modifiedTime: '2026-01-02T00:00:00.000Z',
      path: 'root/2026/07/09/academic/letter.pdf',
    });

    expect(prisma.academicYear.findUnique).toHaveBeenCalledWith({ where: { year: 2569 } });
  });
});
