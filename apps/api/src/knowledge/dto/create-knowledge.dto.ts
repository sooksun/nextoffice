import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateKnowledgeDto {
  @ApiProperty({ example: 'policy', enum: ['policy', 'horizon'] })
  @IsString()
  @IsIn(['policy', 'horizon'])
  type: string;

  @ApiProperty({ example: 'ระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ พ.ศ. 2526' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'ระเบียบว่าด้วยการรับ-ส่ง เก็บรักษา และทำลายหนังสือราชการ' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ example: 'เนื้อหาเต็มของระเบียบ...' })
  @IsOptional()
  @IsString()
  fullText?: string;

  @ApiPropertyOptional({ example: 'สำนักนายกรัฐมนตรี' })
  @IsOptional()
  @IsString()
  issuingAuthority?: string;

  @ApiPropertyOptional({ example: 'mandatory' })
  @IsOptional()
  @IsString()
  mandatoryLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clauseText?: string;
}
