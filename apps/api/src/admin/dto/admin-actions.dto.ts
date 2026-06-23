import { IsInt, IsOptional, IsPositive, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NewAcademicYearDto {
  @ApiPropertyOptional({ description: 'Must match the session org (enforced in the controller)' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  organizationId?: number;

  @ApiProperty({ example: 2569, description: 'Buddhist-era year' })
  @IsInt()
  @IsPositive()
  year: number;

  @ApiPropertyOptional({ example: 'ปีการศึกษา 2569' })
  @IsOptional()
  @IsString()
  yearName?: string;

  @ApiProperty({ example: '2026-05-16', description: 'ISO date' })
  @IsString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ example: '2027-03-31', description: 'ISO date' })
  @IsString()
  @IsNotEmpty()
  endDate: string;
}

export class SeedDemoDto {
  @ApiPropertyOptional({ description: 'Must match the session org (enforced in the controller)' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  organizationId?: number;
}
