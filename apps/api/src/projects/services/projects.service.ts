import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId?: number, status?: string) {
    const where: any = {};
    if (organizationId) where.organizationId = BigInt(organizationId);
    if (status) where.status = status;

    const projects = await this.prisma.project.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        responsible: { select: { id: true, fullName: true } },
        topics: true,
        _count: { select: { documents: true, reports: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return projects.map((p) => this.serialize(p));
  }

  async findOne(id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: BigInt(id) },
      include: {
        organization: { select: { id: true, name: true } },
        responsible: { select: { id: true, fullName: true } },
        topics: true,
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        reports: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!project) throw new NotFoundException(`Project #${id} not found`);
    return this.serialize(project);
  }

  async create(data: {
    organizationId: number;
    name: string;
    description?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    budgetAmount?: number;
    responsibleUserId?: number;
    policyAlignment?: string;
    topics?: { topicCode: string; score?: number }[];
  }) {
    const project = await this.prisma.project.create({
      data: {
        organizationId: BigInt(data.organizationId),
        name: data.name,
        description: data.description || null,
        status: data.status || 'draft',
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        budgetAmount: data.budgetAmount ?? null,
        responsibleUserId: data.responsibleUserId ? BigInt(data.responsibleUserId) : null,
        policyAlignment: data.policyAlignment || null,
        topics: data.topics?.length
          ? {
              create: data.topics.map((t) => ({
                topicCode: t.topicCode,
                score: t.score ?? null,
              })),
            }
          : undefined,
      },
      include: {
        topics: true,
      },
    });

    this.logger.log(`Created project #${project.id}: ${data.name}`);
    return this.serialize(project);
  }

  async update(
    id: number,
    data: {
      name?: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      budgetAmount?: number;
      responsibleUserId?: number;
      policyAlignment?: string;
    },
  ) {
    const existing = await this.prisma.project.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) throw new NotFoundException(`Project #${id} not found`);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
    if (data.budgetAmount !== undefined) updateData.budgetAmount = data.budgetAmount;
    if (data.responsibleUserId !== undefined) {
      updateData.responsibleUserId = data.responsibleUserId ? BigInt(data.responsibleUserId) : null;
    }
    if (data.policyAlignment !== undefined) updateData.policyAlignment = data.policyAlignment;

    const project = await this.prisma.project.update({
      where: { id: BigInt(id) },
      data: updateData,
      include: {
        topics: true,
        organization: { select: { id: true, name: true } },
        responsible: { select: { id: true, fullName: true } },
      },
    });

    this.logger.log(`Updated project #${id}`);
    return this.serialize(project);
  }

  async addDocument(
    projectId: number,
    data: {
      inboundCaseId?: number;
      documentId?: number;
      linkType?: string;
      matchScore?: number;
      matchRationale?: string;
    },
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: BigInt(projectId) },
    });
    if (!project) throw new NotFoundException(`Project #${projectId} not found`);

    const doc = await this.prisma.projectDocument.create({
      data: {
        projectId: BigInt(projectId),
        inboundCaseId: data.inboundCaseId ? BigInt(data.inboundCaseId) : null,
        documentId: data.documentId ? BigInt(data.documentId) : null,
        linkType: data.linkType || 'manual',
        matchScore: data.matchScore ?? null,
        matchRationale: data.matchRationale || null,
      },
    });

    this.logger.log(`Linked document to project #${projectId}`);
    return {
      ...doc,
      id: Number(doc.id),
      projectId: Number(doc.projectId),
      inboundCaseId: doc.inboundCaseId ? Number(doc.inboundCaseId) : null,
      documentId: doc.documentId ? Number(doc.documentId) : null,
    };
  }

  async getDocuments(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: BigInt(projectId) },
    });
    if (!project) throw new NotFoundException(`Project #${projectId} not found`);

    const docs = await this.prisma.projectDocument.findMany({
      where: { projectId: BigInt(projectId) },
      orderBy: { createdAt: 'desc' },
    });

    return docs.map((d) => ({
      ...d,
      id: Number(d.id),
      projectId: Number(d.projectId),
      inboundCaseId: d.inboundCaseId ? Number(d.inboundCaseId) : null,
      documentId: d.documentId ? Number(d.documentId) : null,
    }));
  }

  private serialize(obj: any) {
    if (!obj) return obj;
    const serialized = { ...obj };
    if (serialized.id) serialized.id = Number(serialized.id);
    if (serialized.organizationId) serialized.organizationId = Number(serialized.organizationId);
    if (serialized.responsibleUserId) serialized.responsibleUserId = Number(serialized.responsibleUserId);
    if (serialized.organization) {
      serialized.organization = { ...serialized.organization, id: Number(serialized.organization.id) };
    }
    if (serialized.responsible) {
      serialized.responsible = { ...serialized.responsible, id: Number(serialized.responsible.id) };
    }
    if (serialized.topics) {
      serialized.topics = serialized.topics.map((t) => ({
        ...t,
        id: Number(t.id),
        projectId: Number(t.projectId),
      }));
    }
    if (serialized.documents) {
      serialized.documents = serialized.documents.map((d) => ({
        ...d,
        id: Number(d.id),
        projectId: Number(d.projectId),
        inboundCaseId: d.inboundCaseId ? Number(d.inboundCaseId) : null,
        documentId: d.documentId ? Number(d.documentId) : null,
      }));
    }
    if (serialized.reports) {
      serialized.reports = serialized.reports.map((r) => ({
        ...r,
        id: Number(r.id),
        projectId: Number(r.projectId),
      }));
    }
    if (serialized._count) {
      serialized._count = { ...serialized._count };
    }
    return serialized;
  }
}
