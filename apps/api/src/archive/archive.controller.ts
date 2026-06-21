import { Controller, Get, Post, Param, Body, Query, ParseIntPipe, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ArchiveService } from './archive.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('archive')
@Controller('archive')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ArchiveController {
  constructor(private readonly svc: ArchiveService) {}

  /** Block access to another organization's data unless the caller is ADMIN. */
  private assertOrg(user: any, orgId: number) {
    if (user.roleCode !== 'ADMIN' && Number(user.organizationId) !== orgId) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลของหน่วยงานอื่น');
    }
  }

  // ─── Folders ───

  @Get(':orgId/folders')
  @ApiOperation({ summary: 'List document folders' })
  listFolders(@Param('orgId', ParseIntPipe) orgId: number, @CurrentUser() user: any) {
    this.assertOrg(user, orgId);
    return this.svc.listFolders(orgId);
  }

  @Post(':orgId/folders')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'CLERK')
  @ApiOperation({ summary: 'Create a document folder' })
  createFolder(
    @Param('orgId', ParseIntPipe) orgId: number,
    @CurrentUser() user: any,
    @Body() dto: { name: string; code: string; parentId?: number; retentionYears?: number; description?: string },
  ) {
    this.assertOrg(user, orgId);
    return this.svc.createFolder(orgId, dto);
  }

  // ─── Archive Documents ───

  @Post('documents/:registryId/file')
  @ApiOperation({ summary: 'Move document to folder (archive)' })
  archiveDocument(
    @Param('registryId', ParseIntPipe) registryId: number,
    @CurrentUser() user: any,
    @Body('folderId', ParseIntPipe) folderId: number,
  ) {
    return this.svc.archiveDocument(registryId, folderId, Number(user.organizationId));
  }

  @Get(':orgId/registry')
  @ApiOperation({ summary: 'List archived documents' })
  @ApiQuery({ name: 'folderId', required: false, type: Number })
  listArchived(
    @Param('orgId', ParseIntPipe) orgId: number,
    @CurrentUser() user: any,
    @Query('folderId') folderId?: string,
  ) {
    this.assertOrg(user, orgId);
    return this.svc.listArchivedDocuments(orgId, folderId ? parseInt(folderId, 10) : undefined);
  }

  @Get(':orgId/expiring')
  @ApiOperation({ summary: 'List documents with expiring retention period' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  listExpiring(
    @Param('orgId', ParseIntPipe) orgId: number,
    @CurrentUser() user: any,
    @Query('days') days?: string,
  ) {
    this.assertOrg(user, orgId);
    return this.svc.getExpiringDocuments(orgId, days ? parseInt(days, 10) : 30);
  }

  // ─── Destruction Workflow ───

  @Post(':orgId/destruction')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'CLERK')
  @ApiOperation({ summary: 'Create destruction request' })
  createDestruction(
    @Param('orgId', ParseIntPipe) orgId: number,
    @CurrentUser() user: any,
    @Body() body: { registryIds: number[] },
  ) {
    this.assertOrg(user, orgId);
    return this.svc.createDestructionRequest(orgId, Number(user.id), body.registryIds);
  }

  @Get(':orgId/destruction')
  @ApiOperation({ summary: 'List destruction requests' })
  listDestruction(@Param('orgId', ParseIntPipe) orgId: number, @CurrentUser() user: any) {
    this.assertOrg(user, orgId);
    return this.svc.listDestructionRequests(orgId);
  }

  @Post('destruction/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: 'Approve destruction request (Director only)' })
  approveDestruction(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.approveDestruction(id, Number(user.id), Number(user.organizationId));
  }

  @Post('destruction/:id/confirm')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: 'Confirm destruction performed' })
  confirmDestruction(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: { remarks?: string },
  ) {
    return this.svc.confirmDestruction(id, Number(user.organizationId), body.remarks);
  }
}
