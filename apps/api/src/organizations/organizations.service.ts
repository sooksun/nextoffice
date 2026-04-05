import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const orgs = await this.prisma.organization.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return orgs.map((o) => this.serializeOrg(o));
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
    return this.serializeOrg(org);
  }

  async create(dto: CreateOrganizationDto) {
    const org = await this.prisma.organization.create({ data: dto });
    return this.serializeOrg(org);
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
    return {
      profile: profile ? this.serializeRecord(profile) : null,
      scores: scores.map((s) => this.serializeRecord(s)),
    };
  }

  async getTree() {
    // Get root orgs (no parent) → include 2-level children
    const roots = await this.prisma.organization.findMany({
      where: { parentOrganizationId: null, isActive: true },
      include: {
        childOrganizations: {
          where: { isActive: true },
          include: {
            childOrganizations: {
              where: { isActive: true },
              orderBy: { name: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    return roots.map((r) => this.serializeOrg(r));
  }

  async getChildren(id: number) {
    const children = await this.prisma.organization.findMany({
      where: { parentOrganizationId: BigInt(id), isActive: true },
      orderBy: { name: 'asc' },
    });
    return children.map((c) => this.serializeOrg(c));
  }

  private serializeOrg(org: any) {
    const result: any = {
      ...org,
      id: Number(org.id),
      parentOrganizationId: org.parentOrganizationId
        ? Number(org.parentOrganizationId)
        : null,
    };
    if (org.childOrganizations) {
      result.childOrganizations = org.childOrganizations.map((c: any) =>
        this.serializeOrg(c),
      );
    }
    if (org.profiles) {
      result.profiles = org.profiles.map((p: any) => this.serializeRecord(p));
    }
    if (org.contextScores) {
      result.contextScores = org.contextScores.map((s: any) => this.serializeRecord(s));
    }
    return result;
  }

  private serializeRecord(record: any) {
    if (!record) return record;
    const result: any = { ...record };
    for (const key of Object.keys(result)) {
      if (typeof result[key] === 'bigint') {
        result[key] = Number(result[key]);
      } else if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key]) && !(result[key] instanceof Date)) {
        result[key] = this.serializeRecord(result[key]);
      }
    }
    return result;
  }
}
