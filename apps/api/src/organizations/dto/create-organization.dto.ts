import { IsString, IsOptional, IsBoolean } from 'class-validator';
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

  @ApiPropertyOptional({ example: 'school', default: 'school' })
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  district?: string;
}
