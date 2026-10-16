import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    description: 'Refresh token issued by /auth/login or /auth/refresh',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}