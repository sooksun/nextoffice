import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.organization.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id: BigInt(id) },
      include: {
        profiles: { orderBy: { profileYear: 'desc' }, take: 1 },
        contextScores: { include: { dimension: true } },
      },
    });
    if (!org) throw new NotFoundException(`Organization #${id} not found`);
    return org;
  }

  async create(dto: CreateOrganizationDto) {
    return this.prisma.organization.create({ data: dto });
  }

  async getContext(id: number) {
    const profile = await this.prisma.organizationProfile.findFirst({
      where: { organizationId: BigInt(id) },
      orderBy: { profileYear: 'desc' },
    });
    const scores = await this.prisma.organizationContextScore.findMany({
      where: { organizationId: BigInt(id) },
      include: { dimension: true },
    });
    return { profile, scores };
  }
}
