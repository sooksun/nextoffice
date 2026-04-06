import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ProjectMatch {
  projectId: number;
  projectName: string;
  score: number;
  overlappingTopics: string[];
  linkType: string;
}

@Injectable()
export class ProjectMatchingService {
  private readonly logger = new Logger(ProjectMatchingService.name);
  private readonly AUTO_LINK_THRESHOLD = 0.6;

  constructor(private readonly prisma: PrismaService) {}

  async matchCase(caseId: number): Promise<ProjectMatch[]> {
    const inboundCase = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: {
        topics: { include: { topic: true } },
      },
    });
    if (!inboundCase) throw new NotFoundException(`Case #${caseId} not found`);

    const caseTopicCodes = inboundCase.topics.map((ct) => ct.topic.topicCode);
    if (caseTopicCodes.length === 0) {
      this.logger.debug(`Case #${caseId} has no topics, skipping matching`);
      return [];
    }

    const projects = await this.prisma.project.findMany({
      where: {
        organizationId: inboundCase.organizationId,
        status: { in: ['active', 'draft'] },
      },
      include: {
        topics: true,
      },
    });

    const matches: ProjectMatch[] = [];

    for (const project of projects) {
      const projectTopicCodes = project.topics.map((pt) => pt.topicCode);
      if (projectTopicCodes.length === 0) continue;

      const overlapping = caseTopicCodes.filter((code) => projectTopicCodes.includes(code));
      if (overlapping.length === 0) continue;

      const maxTopics = Math.max(caseTopicCodes.length, projectTopicCodes.length);
      const topicOverlapScore = overlapping.length / maxTopics;

      const statusBoost = project.status === 'active' ? 0.1 : 0;
      const finalScore = Math.min(topicOverlapScore + statusBoost, 1.0);

      matches.push({
        projectId: Number(project.id),
        projectName: project.name,
        score: Math.round(finalScore * 10000) / 10000,
        overlappingTopics: overlapping,
        linkType: finalScore >= this.AUTO_LINK_THRESHOLD ? 'auto_matched' : 'suggested',
      });
    }

    matches.sort((a, b) => b.score - a.score);

    for (const match of matches) {
      if (match.score >= this.AUTO_LINK_THRESHOLD) {
        const existing = await this.prisma.projectDocument.findFirst({
          where: {
            projectId: BigInt(match.projectId),
            inboundCaseId: BigInt(caseId),
          },
        });
        if (!existing) {
          await this.prisma.projectDocument.create({
            data: {
              projectId: BigInt(match.projectId),
              inboundCaseId: BigInt(caseId),
              linkType: 'auto_matched',
              matchScore: match.score,
              matchRationale: `Topic overlap: ${match.overlappingTopics.join(', ')}`,
            },
          });
          this.logger.log(
            `Auto-linked case #${caseId} to project #${match.projectId} (score: ${match.score})`,
          );
        }
      }
    }

    return matches;
  }

  async getMatchesForCase(caseId: number) {
    const docs = await this.prisma.projectDocument.findMany({
      where: { inboundCaseId: BigInt(caseId) },
      include: {
        project: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    return docs.map((d) => ({
      id: Number(d.id),
      projectId: Number(d.project.id),
      projectName: d.project.name,
      projectStatus: d.project.status,
      linkType: d.linkType,
      matchScore: d.matchScore ? Number(d.matchScore) : null,
      matchRationale: d.matchRationale,
      createdAt: d.createdAt,
    }));
  }
}
