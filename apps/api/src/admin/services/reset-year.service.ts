import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface ResetYearDto {
  organizationId: number;
  year: number;        // Thai year (พ.ศ.) e.g. 2570
  yearName?: string;   // defaults to "ปีการศึกษา {year}"
  startDate: string;   // ISO date e.g. "2027-05-16"
  endDate: string;     // ISO date e.g. "2028-03-31"
}

@Injectable()
export class ResetYearService {
  private readonly logger = new Logger(ResetYearService.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: ResetYearDto) {
    const orgId = BigInt(dto.organizationId);

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException(`Organization #${dto.organizationId} not found`);

    this.logger.log(`Starting year reset for org ${dto.organizationId} → year ${dto.year}`);

    // ─── 1. Create / upsert new AcademicYear ────────────────────────────────
    const newYear = await this.prisma.academicYear.upsert({
      where: { year: dto.year },
      update: {
        name: dto.yearName ?? `ปีการศึกษา ${dto.year}`,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: true,
      },
      create: {
        year: dto.year,
        name: dto.yearName ?? `ปีการศึกษา ${dto.year}`,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: true,
      },
    });

    // Set all other years to isCurrent=false
    await this.prisma.academicYear.updateMany({
      where: { year: { not: dto.year } },
      data: { isCurrent: false },
    });

    // Update org's active academic year
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { activeAcademicYearId: newYear.id },
    });

    // ─── 2. Collect IDs to delete ─────────────────────────────────────────
    const cases = await this.prisma.inboundCase.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    const caseIds = cases.map((c) => c.id);

    const intakes = await this.prisma.documentIntake.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    const intakeIds = intakes.map((i) => i.id);

    const deleted: Record<string, number> = {};

    if (caseIds.length > 0 || intakeIds.length > 0) {
      // ─── 3. Delete in FK-safe order ────────────────────────────────────
      await this.prisma.$transaction(async (tx) => {

        // Case children (deepest first)
        if (caseIds.length > 0) {
          deleted.caseOptionReferences = (await tx.caseOptionReference.deleteMany({
            where: { caseOption: { inboundCaseId: { in: caseIds } } },
          })).count;

          deleted.caseOptions = (await tx.caseOption.deleteMany({
            where: { inboundCaseId: { in: caseIds } },
          })).count;

          deleted.caseRetrievalResults = (await tx.caseRetrievalResult.deleteMany({
            where: { inboundCaseId: { in: caseIds } },
          })).count;

          deleted.casePredictions = (await tx.casePrediction.deleteMany({
            where: { inboundCaseId: { in: caseIds } },
          })).count;

          deleted.caseTopics = (await tx.caseTopic.deleteMany({
            where: { inboundCaseId: { in: caseIds } },
          })).count;

          deleted.caseActivities = (await tx.caseActivity.deleteMany({
            where: { inboundCaseId: { in: caseIds } },
          })).count;

          deleted.caseEndorsements = (await tx.caseEndorsement.deleteMany({
            where: { inboundCaseId: { in: caseIds } },
          })).count;

          deleted.caseAssignments = (await tx.caseAssignment.deleteMany({
            where: { inboundCaseId: { in: caseIds } },
          })).count;

          deleted.outboundDocuments = (await tx.outboundDocument.deleteMany({
            where: { relatedInboundCaseId: { in: caseIds } },
          })).count;

          deleted.documentRegistries = (await tx.documentRegistry.deleteMany({
            where: { inboundCaseId: { in: caseIds } },
          })).count;

          deleted.inboundCases = (await tx.inboundCase.deleteMany({
            where: { id: { in: caseIds } },
          })).count;
        }

        // Intake children
        if (intakeIds.length > 0) {
          deleted.lineConversationSessions = (await tx.lineConversationSession.deleteMany({
            where: { documentIntakeId: { in: intakeIds } },
          })).count;

          deleted.documentAiResults = (await tx.documentAiResult.deleteMany({
            where: { documentIntakeId: { in: intakeIds } },
          })).count;

          deleted.documentIntakes = (await tx.documentIntake.deleteMany({
            where: { id: { in: intakeIds } },
          })).count;
        }

        // ─── 4. Reset RegistrationCounter ──────────────────────────────
        await tx.registrationCounter.updateMany({
          where: { organizationId: orgId },
          data: { lastSeq: 0 },
        });
      }, { timeout: 30000 });
    }

    this.logger.log(`Year reset complete. Deleted: ${JSON.stringify(deleted)}`);

    return {
      success: true,
      newAcademicYear: {
        id: Number(newYear.id),
        year: newYear.year,
        name: newYear.name,
        startDate: newYear.startDate,
        endDate: newYear.endDate,
        isCurrent: newYear.isCurrent,
      },
      deleted,
      message: `ล้างข้อมูลเรียบร้อย เริ่มต้นปีการศึกษา ${dto.year} สำหรับ ${org.name}`,
    };
  }
}
