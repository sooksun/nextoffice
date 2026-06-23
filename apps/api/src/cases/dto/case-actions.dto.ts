import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateManualCaseDto {
  @ApiProperty({ example: 'หนังสือเชิญประชุม' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  senderOrg?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientNote?: string;

  @ApiPropertyOptional({ example: 'normal', enum: ['normal', 'urgent', 'most_urgent'] })
  @IsOptional()
  @IsString()
  urgencyLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  intakeId?: number;
}

export class AssignmentItemDto {
  @ApiProperty()
  @IsInt()
  userId: number;

  @ApiPropertyOptional({ example: 'responsible' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class AssignCaseDto {
  @ApiProperty({ type: [AssignmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentItemDto)
  assignments: AssignmentItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  directorNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  selectedOptionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clerkOpinion?: string;

  @ApiPropertyOptional({ enum: ['direct', 'via_vice'] })
  @IsOptional()
  @IsIn(['direct', 'via_vice'])
  routingPath?: 'direct' | 'via_vice';
}

export class UpdateCaseStatusDto {
  @ApiProperty({ example: 'registered' })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class DirectorSignDto {
  @ApiProperty({ example: 'เห็นชอบ มอบกลุ่มบริหารงานทั่วไปดำเนินการ' })
  @IsString()
  @IsNotEmpty()
  noteText: string;

  @ApiProperty({ enum: ['pad', 'electronic'] })
  @IsIn(['pad', 'electronic'])
  signatureMethod: 'pad' | 'electronic';

  @ApiPropertyOptional({ description: 'data:image/png;base64,... (pad method only)' })
  @IsOptional()
  @IsString()
  signatureBase64?: string;
}
