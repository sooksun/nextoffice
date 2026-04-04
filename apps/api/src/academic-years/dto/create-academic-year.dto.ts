import { IsInt, IsString, IsDateString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAcademicYearDto {
  @ApiProperty({ example: 2567, description: 'ปี พ.ศ.' })
  @IsInt()
  year: number;

  @ApiProperty({ example: 'ปีการศึกษา 2567' })
  @IsString()
  name: string;

  @ApiProperty({ example: '2024-05-16' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-03-31' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}
