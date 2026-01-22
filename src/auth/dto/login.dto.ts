import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'trader@nexafx.com',
    description: 'User email address (case-insensitive).',
  })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: 'CorrectHorseBatteryStaple!123',
    description: 'User password. Never returned by the API.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

