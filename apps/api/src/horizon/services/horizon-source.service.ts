import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HorizonSourceService {
  private readonly logger = new Logger(HorizonSourceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters?: {
    sourceType?: string;
    isActive?: boolean;
    search?: string;
  }) {
    const where: any = {};
    if (filters?.sourceType) where.sourceType = filters.sourceType;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    if (filters?.search) {
      where.OR = [
        { sourceName: { contains: filters.search } },
        { organizationName: { contains: filters.search } },
        { sourceCode: { contains: filters.search } },
      ];
    }

    const sources = await this.prisma.horizonSource.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return sources.map((s) => this.serialize(s));
  }

  async findOne(id: number) {
    const source = await this.prisma.horizonSource.findUnique({
      where: { id: BigInt(id) },
      include: {
        documents: {
          orderBy: { fetchedAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!source) throw new NotFoundException(`HorizonSource #${id} not found`);
    return this.serialize(source);
  }

  async create(data: {
    sourceCode: string;
    sourceName: string;
    sourceType: string;
    organizationName: string;
    baseUrl: string;
    trustLevel?: number;
    fetchFrequency?: string;
    configJson?: string;
  }) {
    const source = await this.prisma.horizonSource.create({
      data: {
        sourceCode: data.sourceCode,
        sourceName: data.sourceName,
        sourceType: data.sourceType,
        organizationName: data.organizationName,
        baseUrl: data.baseUrl,
        trustLevel: data.trustLevel ?? 0.8,
        fetchFrequency: data.fetchFrequency ?? 'daily',
        configJson: data.configJson ?? null,
      },
    });
    this.logger.log(`Created HorizonSource: ${source.sourceCode}`);
    return this.serialize(source);
  }

  async update(
    id: number,
    data: Partial<{
      sourceName: string;
      sourceType: string;
      organizationName: string;
      baseUrl: string;
      trustLevel: number;
      fetchFrequency: string;
      configJson: string;
      isActive: boolean;
    }>,
  ) {
    const existing = await this.prisma.horizonSource.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) throw new NotFoundException(`HorizonSource #${id} not found`);

    const source = await this.prisma.horizonSource.update({
      where: { id: BigInt(id) },
      data,
    });
    return this.serialize(source);
  }

  serialize(obj: any) {
    if (!obj) return obj;
    const result: any = {
      ...obj,
      id: Number(obj.id),
      trustLevel: obj.trustLevel ? Number(obj.trustLevel) : null,
    };
    if (obj.documents) {
      result.documents = obj.documents.map((d: any) => ({
        ...d,
        id: Number(d.id),
        sourceId: Number(d.sourceId),
        qualityScore: d.qualityScore ? Number(d.qualityScore) : null,
      }));
    }
    return result;
  }
}
