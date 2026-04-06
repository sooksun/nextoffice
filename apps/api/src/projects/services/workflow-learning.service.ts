import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface RoutingSuggestion {
  topicCode: string;
  routedToGroup: string;
  assignedToRole: string;
  avgProcessDays: number;
  confidence: number;
  sampleCount: number;
}

@Injectable()
export class WorkflowLearningService {
  private readonly logger = new Logger(WorkflowLearningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async learnFromCase(caseId: number) {
    const inboundCase = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: {
        topics: { include: { topic: true } },
        assignments: {
          include: {
            assignedTo: { select: { id: true, roleCode: true } },
          },
        },
        sourceDocument: { select: { documentType: true } },
      },
    });
    if (!inboundCase) throw new NotFoundException(`Case #${caseId} not found`);

    const documentType = inboundCase.sourceDocument?.documentType || 'official';
    const topicCodes = inboundCase.topics.map((ct) => ct.topic.topicCode);

    if (topicCodes.length === 0) {
      this.logger.debug(`Case #${caseId} has no topics, nothing to learn`);
      return { learned: 0 };
    }

    const processDays = inboundCase.receivedAt
      ? (Date.now() - inboundCase.receivedAt.getTime()) / (1000 * 60 * 60 * 24)
      : null;

    const primaryAssignment = inboundCase.assignments.find((a) => a.role === 'responsible');
    const assignedToRole = primaryAssignment?.assignedTo?.roleCode || null;

    let learnedCount = 0;

    for (const topicCode of topicCodes) {
      const existing = await this.prisma.workflowPattern.findUnique({
        where: {
          organizationId_documentType_topicCode: {
            organizationId: inboundCase.organizationId,
            documentType,
            topicCode,
          },
        },
      });

      if (existing) {
        const newSampleCount = existing.sampleCount + 1;
        const currentAvg = existing.avgProcessDays ? Number(existing.avgProcessDays) : 0;
        const newAvg = processDays !== null
          ? (currentAvg * existing.sampleCount + processDays) / newSampleCount
          : currentAvg;

        await this.prisma.workflowPattern.update({
          where: { id: existing.id },
          data: {
            sampleCount: newSampleCount,
            avgProcessDays: Math.round(newAvg * 100) / 100,
            assignedToRole: assignedToRole || existing.assignedToRole,
          },
        });
      } else {
        await this.prisma.workflowPattern.create({
          data: {
            organizationId: inboundCase.organizationId,
            documentType,
            topicCode,
            assignedToRole,
            avgProcessDays: processDays !== null ? Math.round(processDays * 100) / 100 : null,
            sampleCount: 1,
          },
        });
      }

      learnedCount++;
    }

    this.logger.log(`Learned ${learnedCount} patterns from case #${caseId}`);
    return { learned: learnedCount, caseId };
  }

  async suggestRouting(
    organizationId: number,
    documentType: string,
    topicCodes: string[],
  ): Promise<RoutingSuggestion[]> {
    if (!topicCodes.length) return [];

    const patterns = await this.prisma.workflowPattern.findMany({
      where: {
        organizationId: BigInt(organizationId),
        documentType,
        topicCode: { in: topicCodes },
      },
    });

    const maxSampleCount = patterns.reduce((max, p) => Math.max(max, p.sampleCount), 1);

    return patterns.map((p) => ({
      topicCode: p.topicCode,
      routedToGroup: p.routedToGroup || '',
      assignedToRole: p.assignedToRole || '',
      avgProcessDays: p.avgProcessDays ? Number(p.avgProcessDays) : 0,
      confidence: Math.min(p.sampleCount / Math.max(maxSampleCount, 5), 1.0),
      sampleCount: p.sampleCount,
    }));
  }

  async getPatterns(organizationId: number) {
    const patterns = await this.prisma.workflowPattern.findMany({
      where: { organizationId: BigInt(organizationId) },
      orderBy: [{ sampleCount: 'desc' }, { topicCode: 'asc' }],
    });

    return patterns.map((p) => ({
      ...p,
      id: Number(p.id),
      organizationId: Number(p.organizationId),
      avgProcessDays: p.avgProcessDays ? Number(p.avgProcessDays) : null,
    }));
  }
}
