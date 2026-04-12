import { Controller, Get, Post, Param, Body, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ArchiveService } from './archive.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('archive')
@Controller('archive')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ArchiveController {
  constructor(private readonly svc: ArchiveService) {}

  // ─── Folders ───

  @Get(':orgId/folders')
  @ApiOperation({ summary: 'List document folders' })
  listFolders(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.svc.listFolders(orgId);
  }

  @Post(':orgId/folders')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'CLERK')
  @ApiOperation({ summary: 'Create a document folder' })
  createFolder(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: { name: string; code: string; parentId?: number; retentionYears?: number; description?: string },
  ) {
    return this.svc.createFolder(orgId, dto);
  }

  // ─── Archive Documents ───

  @Post('documents/:registryId/file')
  @ApiOperation({ summary: 'Move document to folder (archive)' })
  archiveDocument(
    @Param('registryId', ParseIntPipe) registryId: number,
    @Body('folderId', ParseIntPipe) folderId: number,
  ) {
    return this.svc.archiveDocument(registryId, folderId);
  }

  @Get(':orgId/registry')
  @ApiOperation({ summary: 'List archived documents' })
  @ApiQuery({ name: 'folderId', required: false, type: Number })
  listArchived(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Query('folderId') folderId?: string,
  ) {
    return this.svc.listArchivedDocuments(orgId, folderId ? parseInt(folderId, 10) : undefined);
  }

  @Get(':orgId/expiring')
  @ApiOperation({ summary: 'List documents with expiring retention period' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  listExpiring(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Query('days') days?: string,
  ) {
    return this.svc.getExpiringDocuments(orgId, days ? parseInt(days, 10) : 30);
  }

  // ─── Destruction Workflow ───

  @Post(':orgId/destruction')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR', 'CLERK')
  @ApiOperation({ summary: 'Create destruction request' })
  createDestruction(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() body: { userId: number; registryIds: number[] },
  ) {
    return this.svc.createDestructionRequest(orgId, body.userId, body.registryIds);
  }

  @Get(':orgId/destruction')
  @ApiOperation({ summary: 'List destruction requests' })
  listDestruction(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.svc.listDestructionRequests(orgId);
  }

  @Post('destruction/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: 'Approve destruction request (Director only)' })
  approveDestruction(
    @Param('id', ParseIntPipe) id: number,
    @Body('approvedByUserId', ParseIntPipe) approvedByUserId: number,
  ) {
    return this.svc.approveDestruction(id, approvedByUserId);
  }

  @Post('destruction/:id/confirm')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DIRECTOR')
  @ApiOperation({ summary: 'Confirm destruction performed' })
  confirmDestruction(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { remarks?: string },
  ) {
    return this.svc.confirmDestruction(id, body.remarks);
  }
}
