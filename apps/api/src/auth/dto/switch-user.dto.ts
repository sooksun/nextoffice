import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwitchUserDto {
  @ApiProperty({ example: 'somchai@school.go.th', description: 'Email of the user to switch into' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: "Target user's password" })
  @IsString()
  @IsNotEmpty()
  password: string;
}
