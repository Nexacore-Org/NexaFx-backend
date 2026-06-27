import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class SetPasswordDto {
  @ApiProperty({
    example: 'SecurePassword123!',
    description: 'Password (minimum 12 characters)',
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword: string;
}
