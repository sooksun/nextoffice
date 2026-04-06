import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PolicyAlignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getAlignmentForCase(caseId: number) {
    const inboundCase = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: { topics: { include: { topic: true } } },
    });
    if (!inboundCase) throw new NotFoundException(`Case #${caseId} not found`);

    const caseTopics = inboundCase.topics.map((t) => t.topic.topicCode);
    if (caseTopics.length === 0) {
      return {
        caseId,
        alignments: [],
        overallScore: 0,
        summary: 'ไม่มีหัวข้อสำหรับจับคู่',
      };
    }

    const agendas = await this.prisma.horizonAgenda.findMany({
      where: { currentStatus: { in: ['active', 'peak', 'emerging'] } },
    });

    const alignments = [];
    for (const agenda of agendas) {
      const agendaTopics = agenda.topicTags
        ? JSON.parse(agenda.topicTags)
        : [];
      const overlap = caseTopics.filter((t) => agendaTopics.includes(t));

      if (overlap.length === 0) continue;

      const topicScore =
        overlap.length / Math.max(caseTopics.length, agendaTopics.length);
      const priorityBoost = Number(agenda.priorityScore || 0) * 0.2;
      const momentumBoost = Number(agenda.momentumScore || 0) * 0.1;
      const alignmentScore = Math.min(
        topicScore + priorityBoost + momentumBoost,
        1.0,
      );

      alignments.push({
        agendaId: Number(agenda.id),
        agendaCode: agenda.agendaCode,
        agendaTitle: agenda.agendaTitle,
        agendaType: agenda.agendaType,
        currentStatus: agenda.currentStatus,
        alignmentScore: Math.round(alignmentScore * 10000) / 10000,
        matchedTopics: overlap,
        priorityScore: Number(agenda.priorityScore || 0),
        momentumScore: Number(agenda.momentumScore || 0),
      });
    }

    alignments.sort((a, b) => b.alignmentScore - a.alignmentScore);

    const overallScore =
      alignments.length > 0
        ? Math.round(alignments[0].alignmentScore * 10000) / 10000
        : 0;

    return {
      caseId,
      alignments: alignments.slice(0, 5),
      overallScore,
      summary:
        alignments.length > 0
          ? `สอดคล้องกับ ${alignments.length} วาระนโยบาย หลัก: ${alignments[0].agendaTitle}`
          : 'ไม่พบวาระนโยบายที่เกี่ยวข้อง',
    };
  }
}
