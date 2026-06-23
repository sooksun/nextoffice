import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google ID token from the GIS client' })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
