import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { buildTrigramBooleanQuery } from './search-trigram.util';

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

  // ─── Cases ───────────────────────────────────────────────
  private async searchCases(term: string, orgId: bigint | null, limit: number): Promise<SearchHit[]> {
    const bool = buildTrigramBooleanQuery(term);
    const rows = bool
      ? await this.matchCases(bool, orgId, limit)
      : await this.likeCases(term, orgId, limit);

    return rows.map((r) => ({
      type: 'case' as const,
      id: Number(r.id),
      title: r.title,
      subtitle: r.registrationNo ? `เลขรับ ${r.registrationNo}` : r.status,
      href: `/inbox/${Number(r.id)}`,
    }));
  }

  /** FULLTEXT path — index-backed (sargable) trigram match. */
  private matchCases(bool: string, orgId: bigint | null, limit: number) {
    const params: unknown[] = [bool];
    let sql =
      'SELECT id, title, registration_no AS registrationNo, status FROM inbound_cases ' +
      'WHERE MATCH(search_text) AGAINST(? IN BOOLEAN MODE)';
    if (orgId) {
      sql += ' AND organization_id = ?';
      params.push(orgId);
    }
    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
    return this.prisma.$queryRawUnsafe<
      Array<{ id: bigint; title: string; registrationNo: string | null; status: string }>
    >(sql, ...params);
  }

  /** Fallback for terms too short to yield a trigram (< 3 chars). */
  private async likeCases(term: string, orgId: bigint | null, limit: number) {
    const where: Record<string, unknown> = {
      OR: [{ title: { contains: term } }, { registrationNo: { contains: term } }],
    };
    if (orgId) where.organizationId = orgId;
    return this.prisma.inboundCase.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, registrationNo: true, status: true },
    });
  }

  // ─── Documents ───────────────────────────────────────────
  private async searchDocuments(term: string, limit: number): Promise<SearchHit[]> {
    const bool = buildTrigramBooleanQuery(term);
    const rows = bool
      ? await this.prisma.$queryRawUnsafe<Array<{ id: bigint; title: string | null; documentType: string }>>(
          'SELECT id, title, document_type AS documentType FROM documents ' +
            `WHERE MATCH(search_text) AGAINST(? IN BOOLEAN MODE) ORDER BY created_at DESC LIMIT ${limit}`,
          bool,
        )
      : await this.prisma.document.findMany({
          where: { title: { contains: term } },
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, documentType: true },
        });

    return rows.map((r) => ({
      type: 'document' as const,
      id: Number(r.id),
      title: r.title ?? `เอกสาร #${Number(r.id)}`,
      subtitle: r.documentType,
      href: `/documents/${Number(r.id)}`,
    }));
  }

  // ─── Users ───────────────────────────────────────────────
  private async searchUsers(term: string, orgId: bigint | null, limit: number): Promise<SearchHit[]> {
    const bool = buildTrigramBooleanQuery(term);
    const rows = bool
      ? await this.matchUsers(bool, orgId, limit)
      : await this.likeUsers(term, orgId, limit);

    return rows.map((r) => ({
      type: 'user' as const,
      id: Number(r.id),
      title: r.fullName,
      subtitle: r.positionTitle || r.email || r.roleCode,
      href: `/work-groups`,
    }));
  }

  private matchUsers(bool: string, orgId: bigint | null, limit: number) {
    const params: unknown[] = [bool];
    let sql =
      'SELECT id, full_name AS fullName, email, role_code AS roleCode, position_title AS positionTitle ' +
      'FROM users WHERE MATCH(search_text) AGAINST(? IN BOOLEAN MODE)';
    if (orgId) {
      sql += ' AND organization_id = ?';
      params.push(orgId);
    }
    sql += ` ORDER BY full_name ASC LIMIT ${limit}`;
    return this.prisma.$queryRawUnsafe<
      Array<{ id: bigint; fullName: string; email: string; roleCode: string; positionTitle: string | null }>
    >(sql, ...params);
  }

  private async likeUsers(term: string, orgId: bigint | null, limit: number) {
    const where: Record<string, unknown> = {
      OR: [{ fullName: { contains: term } }, { email: { contains: term } }],
    };
    if (orgId) where.organizationId = orgId;
    return this.prisma.user.findMany({
      where,
      take: limit,
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, email: true, roleCode: true, positionTitle: true },
    });
  }
}
