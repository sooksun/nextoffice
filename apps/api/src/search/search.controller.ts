import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface SearchHit {
  type: 'case' | 'document' | 'user';
  id: number;
  title: string;
  subtitle?: string | null;
  href: string;
}

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('quick')
  @ApiOperation({ summary: 'Unified quick search — cases + documents + users' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async quickSearch(
    @CurrentUser() user: { id: number; organizationId?: number | null },
    @Query('q') q: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{ q: string; hits: SearchHit[] }> {
    const term = (q ?? '').trim();
    if (term.length < 2) return { q: term, hits: [] };

    const limit = Math.min(Math.max(Number(limitRaw) || 5, 1), 10);
    const orgId = user.organizationId ? BigInt(user.organizationId) : null;

    const [cases, documents, users] = await Promise.all([
      this.searchCases(term, orgId, limit),
      this.searchDocuments(term, limit),
      this.searchUsers(term, orgId, limit),
    ]);

    return { q: term, hits: [...cases, ...documents, ...users] };
  }

  private async searchCases(term: string, orgId: bigint | null, limit: number): Promise<SearchHit[]> {
    const where: Record<string, unknown> = {
      OR: [
        { title: { contains: term } },
        { registrationNo: { contains: term } },
      ],
    };
    if (orgId) where.organizationId = orgId;

    const rows = await this.prisma.inboundCase.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        registrationNo: true,
        status: true,
      },
    });

    return rows.map((r) => ({
      type: 'case' as const,
      id: Number(r.id),
      title: r.title,
      subtitle: r.registrationNo ? `เลขรับ ${r.registrationNo}` : r.status,
      href: `/inbox/${Number(r.id)}`,
    }));
  }

  private async searchDocuments(term: string, limit: number): Promise<SearchHit[]> {
    const rows = await this.prisma.document.findMany({
      where: { title: { contains: term } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        documentType: true,
      },
    });

    return rows.map((r) => ({
      type: 'document' as const,
      id: Number(r.id),
      title: r.title ?? `เอกสาร #${Number(r.id)}`,
      subtitle: r.documentType,
      href: `/documents/${Number(r.id)}`,
    }));
  }

  private async searchUsers(term: string, orgId: bigint | null, limit: number): Promise<SearchHit[]> {
    const where: Record<string, unknown> = {
      OR: [
        { fullName: { contains: term } },
        { email: { contains: term } },
      ],
    };
    if (orgId) where.organizationId = orgId;

    const rows = await this.prisma.user.findMany({
      where,
      take: limit,
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        roleCode: true,
        positionTitle: true,
      },
    });

    return rows.map((r) => ({
      type: 'user' as const,
      id: Number(r.id),
      title: r.fullName,
      subtitle: r.positionTitle || r.email || r.roleCode,
      href: `/work-groups`, // Users list page; could be refined to profile route
    }));
  }
}
