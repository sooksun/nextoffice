import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { DriveImportFileFilters, DriveImportService, DriveImportUser } from '../services/drive-import.service';
import {
  BulkDriveImportDto,
  CreateDriveImportSourceDto,
  TestDriveLinkDto,
  UpdateDriveImportFileMappingDto,
  UpdateDriveImportSourceDto,
} from '../dto/drive-import.dto';

@ApiTags('drive-import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('drive-import')
export class DriveImportController {
  constructor(private readonly driveImport: DriveImportService) {}

  @Post('sources/test-link')
  @ApiOperation({ summary: 'Test a Google Drive folder link and extract folder metadata' })
  testLink(@Body() body: TestDriveLinkDto) {
    return this.driveImport.testLink(body);
  }

  @Get('sources')
  @ApiOperation({ summary: 'List Google Drive import sources for current organization' })
  listSources(@CurrentUser() user: DriveImportUser) {
    return this.driveImport.listSources(user);
  }

  @Post('sources')
  @ApiOperation({ summary: 'Create a Google Drive import source' })
  createSource(@CurrentUser() user: DriveImportUser, @Body() body: CreateDriveImportSourceDto) {
    return this.driveImport.createSource(user, body);
  }

  @Patch('sources/:id')
  @ApiOperation({ summary: 'Update a Google Drive import source' })
  updateSource(
    @CurrentUser() user: DriveImportUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateDriveImportSourceDto,
  ) {
    return this.driveImport.updateSource(user, id, body);
  }

  @Post('sources/:id/scan')
  @ApiOperation({ summary: 'Scan a Google Drive source and discover files' })
  scanSource(@CurrentUser() user: DriveImportUser, @Param('id', ParseIntPipe) id: number) {
    return this.driveImport.scanSource(user, id);
  }

  @Get('files')
  @ApiOperation({ summary: 'List discovered Google Drive files' })
  listFiles(@CurrentUser() user: DriveImportUser, @Query() query: DriveImportFileFilters) {
    return this.driveImport.listFiles(user, query);
  }

  @Post('files/bulk-import')
  @ApiOperation({ summary: 'Queue discovered Google Drive files for import' })
  bulkImport(@CurrentUser() user: DriveImportUser, @Body() body: BulkDriveImportDto) {
    return this.driveImport.queueBulkImport(user, body?.ids);
  }

  @Post('files/:id/import')
  @ApiOperation({ summary: 'Queue a Google Drive file for import' })
  importFile(@CurrentUser() user: DriveImportUser, @Param('id', ParseIntPipe) id: number) {
    return this.driveImport.queueImport(user, id);
  }

  @Post('files/:id/retry')
  @ApiOperation({ summary: 'Retry a failed Google Drive file import' })
  retryFile(@CurrentUser() user: DriveImportUser, @Param('id', ParseIntPipe) id: number) {
    return this.driveImport.queueImport(user, id);
  }

  @Patch('files/:id/mapping')
  @ApiOperation({ summary: 'Override year/workgroup mapping for a discovered Drive file' })
  updateFileMapping(
    @CurrentUser() user: DriveImportUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateDriveImportFileMappingDto,
  ) {
    return this.driveImport.updateFileMapping(user, id, body);
  }
}
