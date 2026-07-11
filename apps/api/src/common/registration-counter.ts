import { PrismaService } from '../prisma/prisma.service';

/**
 * Shared RegistrationCounter helpers.
 *
 * Year key is Buddhist Era (พ.ศ.) — matches AcademicYear.year and display.
 * Resolution order: knownYear → org.activeAcademicYear → global isCurrent → CE+543.
 *
 * counterType: inbound | outbound | handover | dispatch | loan
 */

export async function resolveBuddhistYear(
  prisma: PrismaService,
  organizationId: bigint,
  knownYear?: number | null,
): Promise<number> {
  if (knownYear != null && knownYear > 0) return knownYear;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { activeAcademicYear: { select: { year: true } } },
  });
  if (org?.activeAcademicYear?.year) return org.activeAcademicYear.year;

  const currentYear = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
  return currentYear?.year ?? new Date().getFullYear() + 543;
}

export type NextSeqResult = {
  lastSeq: number;
  year: number;
  /** Zero-padded sequence only, e.g. "007" */
  padded: string;
  /** Display form, e.g. "007/2569" */
  formatted: string;
};

/**
 * Atomic next sequence via RegistrationCounter upsert.
 * create lastSeq=1 · update lastSeq += 1 (same pattern as CaseWorkflowService).
 */
export async function nextRegistrationSeq(
  prisma: PrismaService,
  organizationId: bigint,
  counterType: string,
  options?: { knownYear?: number | null; pad?: number },
): Promise<NextSeqResult> {
  const year = await resolveBuddhistYear(prisma, organizationId, options?.knownYear);
  const pad = options?.pad ?? 3;

  const counter = await prisma.registrationCounter.upsert({
    where: {
      organizationId_year_counterType: {
        organizationId,
        year,
        counterType,
      },
    },
    create: { organizationId, year, counterType, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });

  const padded = String(counter.lastSeq).padStart(pad, '0');
  return {
    lastSeq: counter.lastSeq,
    year,
    padded,
    formatted: `${padded}/${year}`,
  };
}
