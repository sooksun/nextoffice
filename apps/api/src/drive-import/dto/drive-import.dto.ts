import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class TestDriveLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rootFolderUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  rootFolderId?: string;
}

export class CreateDriveImportSourceDto extends TestDriveLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['manual', 'scheduled'])
  syncMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  syncCron?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  syncTimezone?: string;

  @IsOptional()
  @IsString()
  folderMappingJson?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDriveImportSourceDto extends CreateDriveImportSourceDto {}

export class UpdateDriveImportFileMappingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  academicYearId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workGroupId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workFunctionId?: number;
}

export class BulkDriveImportDto {
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids?: number[];
}
