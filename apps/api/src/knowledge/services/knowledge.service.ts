import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateKnowledgeDto } from '../dto/create-knowledge.dto';

@Injectable()
export class KnowledgeService {
  constructor(private prisma: PrismaService) {}

  async findAll(type?: string) {
    const policies = !type || type === 'policy'
      ? await this.prisma.policyItem.findMany({
          include: { document: true, clauses: { take: 3 } },
          orderBy: { id: 'desc' },
        })
      : [];

    const horizons = !type || type === 'horizon'
      ? await this.prisma.horizonItem.findMany({
          include: { document: true, practices: { take: 3 } },
          orderBy: { id: 'desc' },
        })
      : [];

    return {
      policies: policies.map((p) => this.serializePolicy(p)),
      horizons: horizons.map((h) => this.serializeHorizon(h)),
      total: policies.length + horizons.length,
    };
  }

  async create(dto: CreateKnowledgeDto) {
    // First create a Document to hold the knowledge
    const doc = await this.prisma.document.create({
      data: {
        title: dto.title,
        sourceType: 'manual_entry',
        documentType: dto.type === 'policy' ? 'regulation' : 'best_practice',
        issuingAuthority: dto.issuingAuthority,
        summaryText: dto.summary,
        fullText: dto.fullText,
        trustLevel: 0.9,
        freshnessScore: 1.0,
        publishedAt: new Date(),
      },
    });

    if (dto.type === 'policy') {
      const policy = await this.prisma.policyItem.create({
        data: {
          documentId: doc.id,
          policyType: 'regulation',
          issuingAuthority: dto.issuingAuthority || 'ไม่ระบุ',
          mandatoryLevel: dto.mandatoryLevel || 'recommended',
          effectiveStatus: 'active',
          summaryForAction: dto.summary,
        },
      });

      // Create clause if provided
      if (dto.clauseText) {
        await this.prisma.policyClause.create({
          data: {
            policyItemId: policy.id,
            clauseCode: 'ข้อ 1',
            clauseText: dto.clauseText,
            obligationType: 'mandatory',
          },
        });
      }

      return { type: 'policy', id: Number(policy.id), documentId: Number(doc.id) };
    } else {
      const horizon = await this.prisma.horizonItem.create({
        data: {
          documentId: doc.id,
          itemType: 'practice',
          summary: dto.summary,
          evidenceStrength: 'medium',
        },
      });

      return { type: 'horizon', id: Number(horizon.id), documentId: Number(doc.id) };
    }
  }

  async delete(type: string, id: number) {
    if (type === 'policy') {
      await this.prisma.policyClause.deleteMany({
        where: { policyItemId: BigInt(id) },
      });
      await this.prisma.policyItem.delete({ where: { id: BigInt(id) } });
    } else {
      await this.prisma.horizonPractice.deleteMany({
        where: { horizonItemId: BigInt(id) },
      });
      await this.prisma.horizonItem.delete({ where: { id: BigInt(id) } });
    }
    return { deleted: true };
  }

  private serializePolicy(item: any) {
    return {
      type: 'policy',
      id: Number(item.id),
      title: item.document?.title || '',
      summary: item.summaryForAction,
      mandatoryLevel: item.mandatoryLevel,
      complianceRiskLevel: item.complianceRiskLevel,
      effectiveStatus: item.effectiveStatus,
      issuingAuthority: item.issuingAuthority,
      clauseCount: item.clauses?.length || 0,
      documentId: item.documentId ? Number(item.documentId) : null,
    };
  }

  private serializeHorizon(item: any) {
    return {
      type: 'horizon',
      id: Number(item.id),
      title: item.document?.title || '',
      summary: item.summary,
      evidenceStrength: item.evidenceStrength,
      practiceCount: item.practices?.length || 0,
      documentId: item.documentId ? Number(item.documentId) : null,
    };
  }
}
