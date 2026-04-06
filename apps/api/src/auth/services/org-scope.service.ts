import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrgScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccessibleOrgIds(userId: number): Promise<bigint[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      include: { organization: true },
    });
    if (!user?.organization) return [];

    if (user.organization.orgType === 'district') {
      const children = await this.prisma.organization.findMany({
        where: { parentOrganizationId: user.organization.id, isActive: true },
        select: { id: true },
      });
      return [user.organization.id, ...children.map((c) => c.id)];
    }

    return [user.organization.id];
  }

  async canAccess(userId: number, organizationId: number): Promise<boolean> {
    const accessible = await this.getAccessibleOrgIds(userId);
    return accessible.some((id) => id === BigInt(organizationId));
  }
}
