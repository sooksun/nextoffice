import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const orgs = await this.prisma.organization.findMany({
      where: { isActive: true },
      include: {
        parentOrganization: { select: { id: true, name: true, areaCode: true, orgType: true } },
        activeAcademicYear: { select: { id: true, year: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return orgs.map((o) => this.serializeOrg(o));
  }

  async findOne(id: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id: BigInt(id) },
      include: {
        parentOrganization: { select: { id: true, name: true, areaCode: true, orgType: true } },
        activeAcademicYear: { select: { id: true, year: true, name: true, isCurrent: true } },
        profiles: { orderBy: { profileYear: 'desc' }, take: 1 },
        contextScores: { include: { dimension: true } },
        childOrganizations: {
          where: { isActive: true },
          select: { id: true, name: true, orgType: true, orgCode: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!org) throw new NotFoundException(`Organization #${id} not found`);
    return this.serializeOrg(org);
  }

  async create(dto: CreateOrganizationDto) {
    const data: any = { ...dto };
    if (dto.parentOrganizationId) data.parentOrganizationId = BigInt(dto.parentOrganizationId);
    const org = await this.prisma.organization.create({ data });
    return this.serializeOrg(org);
  }

  async update(id: number, dto: UpdateOrganizationDto) {
    const existing = await this.prisma.organization.findUnique({ where: { id: BigInt(id) } });
    if (!existing) throw new NotFoundException(`Organization #${id} not found`);

    const data: any = { ...dto };
    if ('parentOrganizationId' in dto) {
      data.parentOrganizationId = dto.parentOrganizationId ? BigInt(dto.parentOrganizationId) : null;
    }

    const org = await this.prisma.organization.update({
      where: { id: BigInt(id) },
      data,
      include: {
        parentOrganization: { select: { id: true, name: true, areaCode: true, orgType: true } },
        activeAcademicYear: { select: { id: true, year: true, name: true, isCurrent: true } },
      },
    });
    return this.serializeOrg(org);
  }

  async setActiveYear(id: number, academicYearId: number) {
    const org = await this.prisma.organization.findUnique({ where: { id: BigInt(id) } });
    if (!org) throw new NotFoundException(`Organization #${id} not found`);

    const year = await this.prisma.academicYear.findUnique({ where: { id: BigInt(academicYearId) } });
    if (!year) throw new NotFoundException(`AcademicYear #${academicYearId} not found`);

    const updated = await this.prisma.organization.update({
      where: { id: BigInt(id) },
      data: { activeAcademicYearId: BigInt(academicYearId) },
      include: { activeAcademicYear: { select: { id: true, year: true, name: true } } },
    });
    return this.serializeOrg(updated);
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
    const roots = await this.prisma.organization.findMany({
      where: { parentOrganizationId: null, isActive: true },
      include: {
        activeAcademicYear: { select: { id: true, year: true, name: true } },
        childOrganizations: {
          where: { isActive: true },
          include: {
            activeAcademicYear: { select: { id: true, year: true, name: true } },
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
      include: {
        activeAcademicYear: { select: { id: true, year: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return children.map((c) => this.serializeOrg(c));
  }

  private serializeOrg(org: any) {
    const result: any = {
      ...org,
      id: Number(org.id),
      parentOrganizationId: org.parentOrganizationId ? Number(org.parentOrganizationId) : null,
      activeAcademicYearId: org.activeAcademicYearId ? Number(org.activeAcademicYearId) : null,
    };
    if (org.parentOrganization) {
      result.parentOrganization = {
        ...org.parentOrganization,
        id: Number(org.parentOrganization.id),
      };
    }
    if (org.activeAcademicYear) {
      result.activeAcademicYear = {
        ...org.activeAcademicYear,
        id: Number(org.activeAcademicYear.id),
      };
    }
    if (org.childOrganizations) {
      result.childOrganizations = org.childOrganizations.map((c: any) => this.serializeOrg(c));
    }
    if (org.profiles) {
      result.profiles = org.profiles.map((p: any) => this.serializeRecord(p));
    }
    if (org.contextScores) {
      result.contextScores = org.contextScores.map((s: any) => this.serializeRecord(s));
    }
    return result;
  }

  async getSmtpConfig(id: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id: BigInt(id) },
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpPass: true,
        smtpFrom: true,
        smtpSecure: true,
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return {
      smtpHost: org.smtpHost ?? '',
      smtpPort: org.smtpPort ?? 587,
      smtpUser: org.smtpUser ?? '',
      smtpPass: org.smtpPass ? '••••••••' : '',
      smtpFrom: org.smtpFrom ?? '',
      smtpSecure: org.smtpSecure ?? false,
      configured: !!(org.smtpHost && org.smtpUser && org.smtpFrom),
    };
  }

  async updateSmtpConfig(id: number, dto: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    smtpSecure: boolean;
  }) {
    const data: any = {
      smtpHost: dto.smtpHost,
      smtpPort: dto.smtpPort,
      smtpUser: dto.smtpUser,
      smtpFrom: dto.smtpFrom,
      smtpSecure: dto.smtpSecure,
    };
    // Only update password if not the masked placeholder
    if (dto.smtpPass && dto.smtpPass !== '••••••••') {
      data.smtpPass = dto.smtpPass;
    }
    await this.prisma.organization.update({
      where: { id: BigInt(id) },
      data,
    });
    return { ok: true };
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
