import { IsEmail, IsString, MinLength, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'somchai@school.go.th' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'สมชาย ใจดี' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'TEACHER', enum: ['DIRECTOR', 'VICE_DIRECTOR', 'HEAD_TEACHER', 'TEACHER', 'CLERK', 'ADMIN'] })
  @IsString()
  @IsIn(['DIRECTOR', 'VICE_DIRECTOR', 'HEAD_TEACHER', 'TEACHER', 'CLERK', 'ADMIN'])
  roleCode: string;

  @ApiPropertyOptional({ example: 1, description: 'Organization ID ที่สังกัด' })
  @IsOptional()
  organizationId?: number;

  @ApiPropertyOptional({ example: 'ครูชำนาญการพิเศษ' })
  @IsOptional()
  @IsString()
  positionTitle?: string;

  @ApiPropertyOptional({ example: 'academic', enum: ['academic', 'budget', 'personnel', 'general'] })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'งานสารบรรณ, งานพัสดุ' })
  @IsOptional()
  @IsString()
  responsibilities?: string;

  @ApiPropertyOptional({ example: '081-234-5678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'somchai@gmail.com', description: 'Google email สำหรับ Calendar invite' })
  @IsOptional()
  @IsEmail()
  googleEmail?: string;
}
