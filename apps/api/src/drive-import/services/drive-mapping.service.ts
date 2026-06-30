import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DriveFileInfo } from '../../intake/services/google-drive.service';

export interface DriveFileMapping {
  academicYearId: bigint | null;
  academicYearLabel: string;
  month: string;
  day: string;
  workGroupId: bigint | null;
  workGroupCode: string;
  confidence: number;
  reason: string;
}

const GROUP_ALIASES = new Map<string, string>(
  [
    ['academic', 'academic'],
    ['academics', 'academic'],
    ['\u0e27\u0e34\u0e0a\u0e32\u0e01\u0e32\u0e23', 'academic'],
    ['budget', 'budget'],
    ['finance', 'budget'],
    ['\u0e07\u0e1a\u0e1b\u0e23\u0e30\u0e21\u0e32\u0e13', 'budget'],
    ['\u0e01\u0e32\u0e23\u0e40\u0e07\u0e34\u0e19', 'budget'],
    ['\u0e1e\u0e31\u0e2a\u0e14\u0e38', 'budget'],
    ['personnel', 'personnel'],
    ['hr', 'personnel'],
    ['\u0e1a\u0e38\u0e04\u0e04\u0e25', 'personnel'],
    ['\u0e07\u0e32\u0e19\u0e1a\u0e38\u0e04\u0e04\u0e25', 'personnel'],
    ['general', 'general'],
    ['admin', 'general'],
    ['\u0e17\u0e31\u0e48\u0e27\u0e44\u0e1b', 'general'],
    ['\u0e1a\u0e23\u0e34\u0e2b\u0e32\u0e23\u0e17\u0e31\u0e48\u0e27\u0e44\u0e1b', 'general'],
    ['\u0e2a\u0e32\u0e23\u0e1a\u0e23\u0e23\u0e13', 'general'],
    ['\u0e18\u0e38\u0e23\u0e01\u0e32\u0e23', 'general'],
  ].map(([alias, code]) => [normalizeLookup(alias), code]),
);

const THAI_MONTHS = new Map<string, string>(
  [
    ['\u0e21\u0e01\u0e23\u0e32\u0e04\u0e21', '01'],
    ['\u0e21.\u0e04.', '01'],
    ['\u0e01\u0e38\u0e21\u0e20\u0e32\u0e1e\u0e31\u0e19\u0e18\u0e4c', '02'],
    ['\u0e01.\u0e1e.', '02'],
    ['\u0e21\u0e35\u0e19\u0e32\u0e04\u0e21', '03'],
    ['\u0e21\u0e35.\u0e04.', '03'],
    ['\u0e40\u0e21\u0e29\u0e32\u0e22\u0e19', '04'],
    ['\u0e40\u0e21.\u0e22.', '04'],
    ['\u0e1e\u0e24\u0e29\u0e20\u0e32\u0e04\u0e21', '05'],
    ['\u0e1e.\u0e04.', '05'],
    ['\u0e21\u0e34\u0e16\u0e38\u0e19\u0e32\u0e22\u0e19', '06'],
    ['\u0e21\u0e34.\u0e22.', '06'],
    ['\u0e01\u0e23\u0e01\u0e0e\u0e32\u0e04\u0e21', '07'],
    ['\u0e01.\u0e04.', '07'],
    ['\u0e2a\u0e34\u0e07\u0e2b\u0e32\u0e04\u0e21', '08'],
    ['\u0e2a.\u0e04.', '08'],
    ['\u0e01\u0e31\u0e19\u0e22\u0e32\u0e22\u0e19', '09'],
    ['\u0e01.\u0e22.', '09'],
    ['\u0e15\u0e38\u0e25\u0e32\u0e04\u0e21', '10'],
    ['\u0e15.\u0e04.', '10'],
    ['\u0e1e\u0e24\u0e28\u0e08\u0e34\u0e01\u0e32\u0e22\u0e19', '11'],
    ['\u0e1e.\u0e22.', '11'],
    ['\u0e18\u0e31\u0e19\u0e27\u0e32\u0e04\u0e21', '12'],
    ['\u0e18.\u0e04.', '12'],
  ].map(([alias, month]) => [normalizeLookup(alias), month]),
);

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase().replace(/[\s.]+/g, '');
}

@Injectable()
export class DriveMappingService {
  constructor(private readonly prisma: PrismaService) {}

  async mapFile(organizationId: bigint, file: DriveFileInfo): Promise<DriveFileMapping> {
    const segments = file.path.split('/').filter(Boolean);
    const pathDate = this.parseDateFromPath(segments);
    const fallbackDate = this.datePartsFromDate(file.modifiedTime ? new Date(file.modifiedTime) : new Date());
    const year = pathDate.year ?? fallbackDate.year;
    const month = pathDate.month ?? fallbackDate.month;
    const day = pathDate.day ?? fallbackDate.day;
    const pathGroupCode = this.findGroupCode(segments);
    const groupCode = pathGroupCode ?? 'general';

    const [academicYear, currentYear, workGroup] = await Promise.all([
      this.prisma.academicYear.findUnique({ where: { year } }),
      this.prisma.academicYear.findFirst({ where: { isCurrent: true } }),
      this.prisma.workGroup.findFirst({
        where: {
          code: groupCode,
          OR: [{ organizationId }, { organizationId: null }],
        },
        orderBy: { organizationId: 'desc' },
      }),
    ]);

    const resolvedYear = academicYear ?? currentYear;
    const confidenceParts = [
      pathDate.year ? 0.35 : 0.15,
      pathDate.month ? 0.2 : 0.1,
      pathDate.day ? 0.2 : 0.1,
      pathGroupCode ? 0.25 : 0.05,
    ];
    const confidence = Math.min(1, confidenceParts.reduce((sum, value) => sum + value, 0));
    const reason = [
      pathDate.year ? `year:path:${year}` : `year:fallback:${year}`,
      pathDate.month && pathDate.day ? `date:path:${month}/${day}` : `date:modified-or-import:${month}/${day}`,
      pathGroupCode ? `group:path:${groupCode}` : `group:fallback:${groupCode}`,
    ].join('; ');

    return {
      academicYearId: resolvedYear?.id ?? null,
      academicYearLabel: String(resolvedYear?.year ?? year),
      month,
      day,
      workGroupId: workGroup?.id ?? null,
      workGroupCode: workGroup?.code ?? groupCode,
      confidence,
      reason,
    };
  }

  private parseDateFromPath(segments: string[]): { year?: number; month?: string; day?: string } {
    const result: { year?: number; month?: string; day?: string } = {};
    const yearIndex = segments.findIndex((segment) => this.parseYear(segment) !== null);
    if (yearIndex >= 0) {
      result.year = this.parseYear(segments[yearIndex]) ?? undefined;
      result.month = this.parseMonth(segments[yearIndex + 1]);
      result.day = this.parseDay(segments[yearIndex + 2]);
    }
    return result;
  }

  private parseYear(segment?: string): number | null {
    if (!segment) return null;
    const match = segment.match(/(25\d{2}|20\d{2})/);
    if (!match) return null;
    const raw = Number(match[1]);
    return raw < 2400 ? raw + 543 : raw;
  }

  private parseMonth(segment?: string): string | undefined {
    if (!segment) return undefined;
    const normalized = segment.trim();
    const numeric = normalized.match(/(?:^|[^0-9])(0?[1-9]|1[0-2])(?:[^0-9]|$)/);
    if (numeric) return numeric[1].padStart(2, '0');
    return THAI_MONTHS.get(normalizeLookup(normalized));
  }

  private parseDay(segment?: string): string | undefined {
    if (!segment) return undefined;
    const match = segment.trim().match(/(?:^|[^0-9])(0?[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
    return match ? match[1].padStart(2, '0') : undefined;
  }

  private findGroupCode(segments: string[]): string | null {
    for (const segment of segments) {
      const groupCode = GROUP_ALIASES.get(normalizeLookup(segment));
      if (groupCode) return groupCode;
    }
    return null;
  }

  private datePartsFromDate(date: Date): { year: number; month: string; day: string } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '01';
    return {
      year: Number(value('year')) + 543,
      month: value('month'),
      day: value('day'),
    };
  }
}
