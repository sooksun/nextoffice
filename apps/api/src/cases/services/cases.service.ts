import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notifications/notification.service';

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications: NotificationService,
  ) {}

  async createFromIntake(documentIntakeId: number) {
    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: BigInt(documentIntakeId) },
      include: { aiResult: true },
    });
    if (!intake) throw new NotFoundException(`DocumentIntake #${documentIntakeId} not found`);

    const orgId = intake.organizationId || BigInt(1);

    // Check if case already exists for this intake (via description pattern)
    const existingCase = await this.prisma.inboundCase.findFirst({
      where: {
        organizationId: orgId,
        description: { contains: `intake:${documentIntakeId}` },
      },
    });
    if (existingCase) {
      return { caseId: Number(existingCase.id), status: 'existing' };
    }

    const title = intake.aiResult?.subjectText || (intake as any).fileName || 'เอกสารไม่ระบุชื่อ';
    const description = [
      intake.aiResult?.summaryText || '',
      `intake:${documentIntakeId}`,
    ].filter(Boolean).join('\n');

    const inboundCase = await this.prisma.inboundCase.create({
      data: {
        organizationId: orgId,
        title,
        description,
        dueDate: intake.aiResult?.deadlineDate ?? null,
        status: 'new',
      },
    });

    // Notify director/clerk of new document arrival
    if (this.notifications) {
      this.notifications.notifyNewDocumentArrived(Number(inboundCase.id)).catch(() => {});
    }

    return { caseId: Number(inboundCase.id), status: 'created' };
  }

  async createManual(dto: {
    organizationId: number;
    createdByUserId: number;
    title: string;
    description?: string;
    documentNo?: string;
    documentDate?: string;
    senderOrg?: string;
    recipientNote?: string;
    urgencyLevel?: string;
    dueDate?: string;
    intakeId?: number;
  }) {
    // Create a Document record so sourceDocument relation is populated in the detail view
    const sourceDoc = await this.prisma.document.create({
      data: {
        title: dto.title,
        sourceType: 'inbound_manual',
        documentType: 'official',
        issuingAuthority: dto.senderOrg || null,
        documentCode: dto.documentNo || null,
        publishedAt: dto.documentDate ? new Date(dto.documentDate) : null,
        status: 'active',
      },
    });

    const descLines: string[] = [];
    if (dto.recipientNote) descLines.push(`ถึง: ${dto.recipientNote}`);
    if (dto.description) descLines.push(dto.description);
    if (dto.intakeId) descLines.push(`intake:${dto.intakeId}`);

    const inboundCase = await this.prisma.inboundCase.create({
      data: {
        organizationId: BigInt(dto.organizationId),
        title: dto.title,
        description: descLines.join('\n') || null,
        urgencyLevel: dto.urgencyLevel || 'normal',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: 'new',
        sourceDocumentId: sourceDoc.id,
      },
    });
    return { caseId: Number(inboundCase.id), status: 'created' };
  }

  async findById(id: number) {
    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(id) },
      include: {
        organization: true,
        sourceDocument: true,
        topics: { include: { topic: true } },
        assignedTo: { select: { id: true, fullName: true, roleCode: true } },
        registeredBy: { select: { id: true, fullName: true } },
      },
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

  async listCases(opts: {
    organizationId?: number;
    status?: string;
    urgencyLevel?: string;
    assignedToUserId?: number;
    academicYearId?: number;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    take?: number;
    skip?: number;
  } = {}) {
    const where: any = {};
    if (opts.organizationId) where.organizationId = BigInt(opts.organizationId);
    if (opts.status) where.status = opts.status;
    if (opts.urgencyLevel) where.urgencyLevel = opts.urgencyLevel;
    if (opts.assignedToUserId) where.assignedToUserId = BigInt(opts.assignedToUserId);
    if (opts.academicYearId) where.academicYearId = BigInt(opts.academicYearId);
    if (opts.dateFrom || opts.dateTo) {
      where.receivedAt = {};
      if (opts.dateFrom) where.receivedAt.gte = new Date(opts.dateFrom);
      if (opts.dateTo) where.receivedAt.lte = new Date(opts.dateTo);
    }
    if (opts.search) {
      where.OR = [
        { title: { contains: opts.search } },
        { registrationNo: { contains: opts.search } },
        { description: { contains: opts.search } },
      ];
    }

    const [cases, total] = await Promise.all([
      this.prisma.inboundCase.findMany({
        where,
        include: {
          organization: true,
          assignedTo: { select: { id: true, fullName: true } },
          registeredBy: { select: { id: true, fullName: true } },
          sourceDocument: { select: { id: true, issuingAuthority: true, documentCode: true } },
        },
        orderBy: { receivedAt: 'desc' },
        take: opts.take ?? 100,
        skip: opts.skip ?? 0,
      }),
      this.prisma.inboundCase.count({ where }),
    ]);
    return { total, data: cases.map((c) => this.serialize(c)) };
  }

  async getMyTasks(userId: number) {
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const in3Days = new Date(now);
    in3Days.setDate(in3Days.getDate() + 3);

    const assignments = await this.prisma.caseAssignment.findMany({
      where: {
        assignedToUserId: BigInt(userId),
        status: { notIn: ['completed'] },
        inboundCase: { status: { notIn: ['completed', 'archived'] } },
      },
      include: {
        inboundCase: {
          select: {
            id: true,
            title: true,
            registrationNo: true,
            urgencyLevel: true,
            dueDate: true,
            status: true,
            directorNote: true,
          },
        },
      },
    });

    const URGENCY_ORDER: Record<string, number> = { most_urgent: 0, very_urgent: 1, urgent: 2, normal: 3 };
    assignments.sort((a, b) => {
      const ua = URGENCY_ORDER[a.inboundCase.urgencyLevel] ?? 3;
      const ub = URGENCY_ORDER[b.inboundCase.urgencyLevel] ?? 3;
      if (ua !== ub) return ua - ub;
      const da = a.dueDate || a.inboundCase.dueDate;
      const db = b.dueDate || b.inboundCase.dueDate;
      if (da && db) return da.getTime() - db.getTime();
      if (da) return -1;
      if (db) return 1;
      return 0;
    });

    const tasks = assignments.map((a) => {
      const due = a.dueDate || a.inboundCase.dueDate;
      const isOverdue = due ? due < now : false;
      return {
        assignmentId: Number(a.id),
        caseId: Number(a.inboundCase.id),
        title: a.inboundCase.title,
        registrationNo: a.inboundCase.registrationNo,
        urgencyLevel: a.inboundCase.urgencyLevel,
        dueDate: due,
        caseStatus: a.inboundCase.status,
        assignmentStatus: a.status,
        role: a.role,
        note: a.note,
        directorNote: a.inboundCase.directorNote,
        isOverdue,
        assignedAt: a.createdAt,
      };
    });

    const overdue = tasks.filter((t) => t.isOverdue).length;
    const dueToday = tasks.filter((t) => t.dueDate && t.dueDate <= endOfToday && !t.isOverdue).length;
    const dueSoon = tasks.filter((t) => t.dueDate && t.dueDate <= in3Days && !t.isOverdue).length;

    return { tasks, summary: { total: tasks.length, overdue, dueToday, dueSoon } };
  }

  async getSchoolPending(organizationId: number) {
    const now = new Date();

    const cases = await this.prisma.inboundCase.findMany({
      where: {
        organizationId: BigInt(organizationId),
        status: { notIn: ['completed', 'archived'] },
      },
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        assignments: {
          where: { status: { notIn: ['completed'] } },
          select: { id: true },
        },
      },
    });

    const URGENCY_ORDER: Record<string, number> = { most_urgent: 0, very_urgent: 1, urgent: 2, normal: 3 };
    cases.sort((a, b) => {
      const ua = URGENCY_ORDER[a.urgencyLevel] ?? 3;
      const ub = URGENCY_ORDER[b.urgencyLevel] ?? 3;
      if (ua !== ub) return ua - ub;
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    const data = cases.map((c) => ({
      caseId: Number(c.id),
      title: c.title,
      registrationNo: c.registrationNo,
      urgencyLevel: c.urgencyLevel,
      dueDate: c.dueDate,
      status: c.status,
      isOverdue: c.dueDate ? c.dueDate < now : false,
      assignedTo: c.assignedTo ? { id: Number(c.assignedTo.id), fullName: c.assignedTo.fullName } : null,
      pendingAssignmentCount: c.assignments.length,
    }));

    const total = data.length;
    const overdue = data.filter((c) => c.isOverdue).length;
    const unregistered = data.filter((c) => ['new', 'analyzing', 'proposed'].includes(c.status)).length;
    const registered = data.filter((c) => c.status === 'registered').length;
    const assigned = data.filter((c) => c.status === 'assigned').length;
    const inProgress = data.filter((c) => c.status === 'in_progress').length;

    return { cases: data, summary: { total, overdue, unregistered, registered, assigned, inProgress } };
  }

  async getOverdue(organizationId?: number) {
    const where: any = {
      status: { notIn: ['completed', 'archived'] },
      dueDate: { lt: new Date() },
    };
    if (organizationId) where.organizationId = BigInt(organizationId);

    const cases = await this.prisma.inboundCase.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        organization: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
    return cases.map((c) => this.serialize(c));
  }

  private serialize(c: any) {
    const result: any = {
      ...c,
      id: Number(c.id),
      organizationId: Number(c.organizationId),
      academicYearId: c.academicYearId ? Number(c.academicYearId) : null,
      sourceDocumentId: c.sourceDocumentId ? Number(c.sourceDocumentId) : null,
      registeredByUserId: c.registeredByUserId ? Number(c.registeredByUserId) : null,
      assignedToUserId: c.assignedToUserId ? Number(c.assignedToUserId) : null,
      selectedOptionId: c.selectedOptionId ? Number(c.selectedOptionId) : null,
    };
    if (c.organization) {
      result.organization = {
        ...c.organization,
        id: Number(c.organization.id),
        parentOrganizationId: c.organization.parentOrganizationId ? Number(c.organization.parentOrganizationId) : null,
      };
    }
    if (c.sourceDocument) {
      result.sourceDocument = {
        ...c.sourceDocument,
        id: Number(c.sourceDocument.id),
      };
    }
    if (c.assignedTo) {
      result.assignedTo = { ...c.assignedTo, id: Number(c.assignedTo.id) };
    }
    if (c.registeredBy) {
      result.registeredBy = { ...c.registeredBy, id: Number(c.registeredBy.id) };
    }
    if (c.topics) {
      result.topics = c.topics.map((t: any) => ({
        ...t,
        id: Number(t.id),
        inboundCaseId: Number(t.inboundCaseId),
        topicId: Number(t.topicId),
        topic: t.topic ? { ...t.topic, id: Number(t.topic.id) } : null,
      }));
    }
    return result;
  }
}
