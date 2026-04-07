import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'โรงเรียนบ้านห้วยน้ำขุ่น' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'รร.ห้วยน้ำขุ่น' })
  @IsOptional()
  @IsString()
  shortName?: string;

  @ApiPropertyOptional({ example: 'SCH-0001' })
  @IsOptional()
  @IsString()
  orgCode?: string;

  @ApiPropertyOptional({ example: 'school', description: 'school | area_office | central_office' })
  @IsOptional()
  @IsString()
  orgType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'เชียงราย' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ example: 'แม่จัน' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ example: 'สพป.เชียงราย เขต 3' })
  @IsOptional()
  @IsString()
  areaCode?: string;

  @ApiPropertyOptional({ example: '053-123456' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'school@example.go.th' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'https://www.school.ac.th' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ description: 'Parent org ID (area_office) for school hierarchy' })
  @IsOptional()
  @IsNumber()
  parentOrganizationId?: number;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orgCode?: string;

  @ApiPropertyOptional({ description: 'school | area_office | central_office' })
  @IsOptional()
  @IsString()
  orgType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ example: 'สพป.เชียงราย เขต 3' })
  @IsOptional()
  @IsString()
  areaCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  parentOrganizationId?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
