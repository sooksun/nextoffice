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

  @ApiProperty({ example: 'TEACHER', enum: ['TEACHER', 'DIRECTOR', 'DISTRICT_STAFF', 'ADMIN'] })
  @IsString()
  @IsIn(['TEACHER', 'DIRECTOR', 'DISTRICT_STAFF', 'ADMIN'])
  roleCode: string;

  @ApiPropertyOptional({ example: 1, description: 'Organization ID ที่สังกัด' })
  @IsOptional()
  organizationId?: number;
}
