import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IsStrongPassword } from './strong-password.decorator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPassword123!' })
  @IsString()
  oldPassword!: string;

  @ApiProperty({ example: 'NewStrongPassword123!' })
  @IsString()
  @IsStrongPassword()
  newPassword!: string;
}
