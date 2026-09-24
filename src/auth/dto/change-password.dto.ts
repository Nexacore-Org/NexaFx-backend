import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPassword123' })
  @IsString()
  oldPassword!: string;

  @ApiProperty({ example: 'NewPassword123' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
