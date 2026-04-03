import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromIntake(documentIntakeId: number) {
    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: BigInt(documentIntakeId) },
      include: { aiResult: true },
    });
    if (!intake) throw new NotFoundException(`DocumentIntake #${documentIntakeId} not found`);
    if (!intake.aiResult?.isOfficialDocument) {
      throw new Error('Document is not classified as an official document');
    }

    const orgId = intake.organizationId || BigInt(1);
    const existing = await this.prisma.inboundCase.findFirst({
      where: { sourceDocumentId: null, organizationId: orgId },
    });

    const inboundCase = await this.prisma.inboundCase.create({
      data: {
        organizationId: orgId,
        title: intake.aiResult.subjectText || 'กรณีจาก intake',
        description: intake.aiResult.summaryText,
        dueDate: intake.aiResult.deadlineDate,
        status: 'new',
      },
    });

    return { caseId: Number(inboundCase.id), status: 'created' };
  }

  async findById(id: number) {
    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(id) },
      include: { organization: true, sourceDocument: true, topics: { include: { topic: true } } },
    });
    if (!c) throw new NotFoundException(`Case #${id} not found`);
    return this.serialize(c);
  }

  async getOptions(id: number) {
    const options = await this.prisma.caseOption.findMany({
      where: { inboundCaseId: BigInt(id) },
      include: { references: true },
      orderBy: { optionCode: 'asc' },
    });
    return {
      caseId: id,
      options: options.map((o) => ({
        id: Number(o.id),
        code: o.optionCode,
        title: o.title,
        description: o.description,
        expectedBenefits: o.expectedBenefits,
        risks: o.risks,
        policyComplianceNote: o.policyComplianceNote,
        contextFitNote: o.contextFitNote,
        feasibilityScore: o.feasibilityScore,
        innovationScore: o.innovationScore,
        complianceScore: o.complianceScore,
        overallScore: o.overallScore,
      })),
    };
  }

  async listCases(organizationId?: number, status?: string) {
    const where: any = {};
    if (organizationId) where.organizationId = BigInt(organizationId);
    if (status) where.status = status;

    const cases = await this.prisma.inboundCase.findMany({
      where,
      include: { organization: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return cases.map(this.serialize);
  }

  private serialize(c: any) {
    return {
      ...c,
      id: Number(c.id),
      organizationId: Number(c.organizationId),
      sourceDocumentId: c.sourceDocumentId ? Number(c.sourceDocumentId) : null,
    };
  }
}
